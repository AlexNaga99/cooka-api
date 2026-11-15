import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { getFirestoreDb } from '../config/firebase.config';
import { getStorage } from 'firebase-admin/storage';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/dto/notification.dto';
import { VisionService, toGcsUri } from './vision.service';
import { transitionRecipeStatus } from './recipe-status';

const SWEEP_INTERVAL_MS = 2 * 60 * 1000;
const SWEEP_BATCH = 20;

interface RecipeDoc {
  authorId: string;
  title?: string;
  status?: string;
  mediaUrls?: string[];
  videoUrl?: string | null;
}

/**
 * Moderação das receitas: toda receita nova (ou com imagem trocada) entra como `pending`,
 * é analisada pelo Google Vision SafeSearch e vira `published`, `review` ou `rejected`.
 * Se a análise falhar, a receita continua `pending` e é retentada pela varredura periódica.
 */
@Injectable()
export class ModerationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ModerationService.name);
  private timer?: NodeJS.Timeout;
  private sweeping = false;
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly vision: VisionService,
    private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return getFirestoreDb();
  }

  onModuleInit(): void {
    if (process.env.MODERATION_DISABLED === 'true') {
      this.logger.warn('Moderação automática DESLIGADA (MODERATION_DISABLED=true)');
      return;
    }
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    setTimeout(() => void this.sweep(), 15_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Dispara a análise em segundo plano (não bloqueia a resposta ao app). */
  enqueue(recipeId: string): void {
    if (process.env.MODERATION_DISABLED === 'true') return;
    void this.process(recipeId).catch((e) =>
      this.logger.warn(`Análise da receita ${recipeId} falhou (será retentada): ${(e as Error).message}`),
    );
  }

  /** Reanalisa as receitas que ficaram `pending` (falha da API, reinício do servidor). */
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const snap = await this.db
        .collection('recipes')
        .where('status', '==', 'pending')
        .limit(SWEEP_BATCH)
        .get();
      for (const d of snap.docs) {
        await this.process(d.id).catch((e) =>
          this.logger.warn(`Retentativa da receita ${d.id} falhou: ${(e as Error).message}`),
        );
      }
    } catch (e) {
      this.logger.warn(`Varredura falhou: ${(e as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }

  async process(recipeId: string): Promise<void> {
    if (this.inFlight.has(recipeId)) return;
    this.inFlight.add(recipeId);
    try {
      const doc = await this.db.collection('recipes').doc(recipeId).get();
      if (!doc.exists) return;
      const data = doc.data() as RecipeDoc;
      if (data.status !== 'pending') return;

      const urls = data.mediaUrls ?? [];
      // Vídeo ainda não é analisado automaticamente: vai para revisão manual.
      let verdict: 'approved' | 'review' | 'rejected' = data.videoUrl ? 'review' : 'approved';
      let detail: unknown[] = [];
      if (urls.length > 0) {
        const res = await this.vision.analyze(urls);
        detail = res.detail;
        if (res.verdict === 'rejected' || (res.verdict === 'review' && verdict === 'approved')) {
          verdict = res.verdict;
        }
      }
      const extra = { moderation: { verdict, at: new Date(), detail, source: 'auto' } };

      if (verdict === 'approved') {
        await transitionRecipeStatus(recipeId, 'published', extra);
      } else if (verdict === 'review') {
        await transitionRecipeStatus(recipeId, 'review', extra);
        await this.notifyAuthor(
          data,
          recipeId,
          'Receita em revisão',
          `Sua receita "${data.title ?? ''}" está em revisão manual e ainda não está visível para outras pessoas.`,
        );
      } else {
        await transitionRecipeStatus(recipeId, 'rejected', extra);
        await this.deleteImages(urls);
        await this.notifyAuthor(
          data,
          recipeId,
          'Receita reprovada',
          `Sua receita "${data.title ?? ''}" foi reprovada por conter conteúdo que não segue as regras do Cooka.`,
        );
      }
      this.logger.log(`Receita ${recipeId} analisada: ${verdict}`);
    } finally {
      this.inFlight.delete(recipeId);
    }
  }

  // ---- ações administrativas ----

  async listForReview(limit = 50): Promise<Array<Record<string, unknown>>> {
    const snap = await this.db.collection('recipes').where('status', '==', 'review').limit(limit).get();
    const items: Array<Record<string, unknown>> = [];
    for (const d of snap.docs) {
      const reports = await this.db
        .collection('reports')
        .where('targetType', '==', 'recipe')
        .where('targetId', '==', d.id)
        .get();
      const x = d.data();
      items.push({
        id: d.id,
        title: x.title,
        authorId: x.authorId,
        mediaUrls: x.mediaUrls,
        videoUrl: x.videoUrl ?? null,
        moderation: x.moderation ?? null,
        reports: reports.docs.map((r) => ({ reason: r.data().reason, description: r.data().description })),
      });
    }
    return items;
  }

  async approve(recipeId: string): Promise<void> {
    const res = await transitionRecipeStatus(recipeId, 'published', {
      moderation: { verdict: 'approved', at: new Date(), source: 'manual' },
    });
    if (res.from === 'missing') throw new NotFoundException('Receita não encontrada');
  }

  async reject(recipeId: string): Promise<void> {
    const doc = await this.db.collection('recipes').doc(recipeId).get();
    if (!doc.exists) throw new NotFoundException('Receita não encontrada');
    const data = doc.data() as RecipeDoc;
    await transitionRecipeStatus(recipeId, 'rejected', {
      moderation: { verdict: 'rejected', at: new Date(), source: 'manual' },
    });
    await this.deleteImages(data.mediaUrls ?? []);
    await this.notifyAuthor(
      data,
      recipeId,
      'Receita reprovada',
      `Sua receita "${data.title ?? ''}" foi reprovada por conter conteúdo que não segue as regras do Cooka.`,
    );
  }

  private async notifyAuthor(data: RecipeDoc, recipeId: string, title: string, body: string): Promise<void> {
    try {
      await this.notifications.createNotification(data.authorId, NotificationType.MODERATION, title, body, {
        recipeId,
      });
    } catch (e) {
      this.logger.warn(`Notificação de moderação falhou: ${(e as Error).message}`);
    }
  }

  private async deleteImages(urls: string[]): Promise<void> {
    for (const url of urls) {
      const uri = toGcsUri(url);
      const m = uri?.match(/^gs:\/\/([^/]+)\/(.+)$/);
      if (!m) continue;
      try {
        await getStorage().bucket(m[1]).file(m[2]).delete({ ignoreNotFound: true });
      } catch (e) {
        this.logger.warn(`Não consegui apagar ${uri}: ${(e as Error).message}`);
      }
    }
  }
}
