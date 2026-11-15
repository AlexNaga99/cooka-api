import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { getFirestoreDb } from '../config/firebase.config';
import { getStorage } from 'firebase-admin/storage';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/dto/notification.dto';
import { VisionService, toGcsUri } from './vision.service';
import { transitionRecipeStatus } from './recipe-status';

const SWEEP_INTERVAL_MS = 2 * 60 * 1000;
const SWEEP_BATCH = 20;

export type AdminStatus = 'review' | 'pending' | 'rejected';
export const ADMIN_STATUSES: AdminStatus[] = ['review', 'pending', 'rejected'];

/** Firestore Timestamp / Date / string -> ISO. */
function toIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  const t = v as { toDate?: () => Date };
  if (typeof t.toDate === 'function') return t.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return null;
}

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

  /**
   * Foto de perfil: análise síncrona (não dá para "publicar e revisar depois").
   * Qualquer coisa que não seja aprovada de cara é barrada e a imagem enviada é apagada.
   * Se o Vision falhar, barra também (fail-closed) e o app pede para tentar de novo.
   */
  async assertProfilePhotoOk(url: string): Promise<void> {
    if (process.env.MODERATION_DISABLED === 'true') return;
    let verdict: 'approved' | 'review' | 'rejected';
    try {
      verdict = (await this.vision.analyzeUrl(url)).verdict;
    } catch (e) {
      this.logger.warn(`Análise da foto de perfil falhou: ${(e as Error).message}`);
      throw new ServiceUnavailableException({
        message: 'Não foi possível verificar a foto agora. Tente novamente em instantes.',
        code: 'IMAGE_CHECK_FAILED',
      });
    }
    if (verdict === 'approved') return;
    await this.deleteImages([url]);
    throw new BadRequestException({
      message: 'Essa foto não segue as regras do Cooka. Escolha outra imagem.',
      code: 'IMAGE_BLOCKED',
      field: 'photo',
    });
  }

  // ---- ações administrativas ----

  /** Lista receitas por status (padrão: `review`) com a receita completa e os dados do autor. */
  async listForReview(
    status: AdminStatus = 'review',
    limit = 50,
  ): Promise<{ counts: Record<string, number>; items: Array<Record<string, unknown>> }> {
    const snap = await this.db.collection('recipes').where('status', '==', status).limit(limit).get();
    const authors = new Map<string, Record<string, unknown>>();
    const items: Array<Record<string, unknown>> = [];
    for (const d of snap.docs) {
      items.push(await this.toAdminItem(d.id, d.data(), authors));
    }
    // Mais antigas primeiro (fila): ordena em memória para não exigir índice composto.
    items.sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
    return { counts: await this.statusCounts(), items };
  }

  async getForAdmin(recipeId: string): Promise<Record<string, unknown>> {
    const doc = await this.db.collection('recipes').doc(recipeId).get();
    if (!doc.exists) throw new NotFoundException('Receita não encontrada');
    return this.toAdminItem(doc.id, doc.data() as Record<string, unknown>, new Map());
  }

  private async statusCounts(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const s of ['review', 'pending', 'rejected'] as const) {
      try {
        const agg = await this.db.collection('recipes').where('status', '==', s).count().get();
        out[s] = agg.data().count;
      } catch {
        out[s] = 0;
      }
    }
    return out;
  }

  private async toAdminItem(
    id: string,
    x: Record<string, unknown>,
    authors: Map<string, Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const reports = await this.db
      .collection('reports')
      .where('targetType', '==', 'recipe')
      .where('targetId', '==', id)
      .get();
    const authorId = String(x.authorId ?? '');
    let author = authors.get(authorId);
    if (!author) {
      author = await this.loadAuthor(authorId);
      authors.set(authorId, author);
    }
    return {
      id,
      status: x.status ?? 'published',
      title: x.title ?? '',
      description: x.description ?? '',
      ingredients: x.ingredients ?? null,
      preparationSteps: x.preparationSteps ?? null,
      categories: x.categories ?? [],
      tags: x.tags ?? [],
      mediaUrls: x.mediaUrls ?? [],
      videoUrl: x.videoUrl ?? null,
      createdAt: toIso(x.createdAt),
      moderation: x.moderation ?? null,
      reports: reports.docs.map((r) => ({ reason: r.data().reason, description: r.data().description })),
      author,
    };
  }

  private async loadAuthor(authorId: string): Promise<Record<string, unknown>> {
    if (!authorId) return { id: '' };
    const u = await this.db.collection('users').doc(authorId).get();
    if (!u.exists) return { id: authorId, missing: true };
    const d = u.data() as Record<string, unknown>;
    let reportsAgainst = 0;
    try {
      const agg = await this.db
        .collection('reports')
        .where('targetType', '==', 'user')
        .where('targetId', '==', authorId)
        .count()
        .get();
      reportsAgainst = agg.data().count;
    } catch {
      /* contagem é só informativa */
    }
    return {
      id: authorId,
      name: d.name ?? '',
      email: d.email ?? '',
      photoUrl: d.photoUrl ?? null,
      recipesCount: d.recipesCount ?? 0,
      followersCount: d.followersCount ?? 0,
      createdAt: toIso(d.createdAt),
      deleted: d.deletedAt != null,
      reportsAgainst,
    };
  }

  async approve(recipeId: string): Promise<void> {
    const doc = await this.db.collection('recipes').doc(recipeId).get();
    if (!doc.exists) throw new NotFoundException('Receita não encontrada');
    const status = (doc.data() as RecipeDoc).status;
    if (status !== 'review' && status !== 'pending') {
      throw new BadRequestException(`Só receitas em revisão/análise podem ser aprovadas (status atual: ${status}).`);
    }
    await transitionRecipeStatus(recipeId, 'published', {
      moderation: { verdict: 'approved', at: new Date(), source: 'manual' },
    });
  }

  async reject(recipeId: string, reason?: string): Promise<void> {
    const doc = await this.db.collection('recipes').doc(recipeId).get();
    if (!doc.exists) throw new NotFoundException('Receita não encontrada');
    const data = doc.data() as RecipeDoc;
    const why = reason?.trim().slice(0, 300) || undefined;
    await transitionRecipeStatus(recipeId, 'rejected', {
      moderation: { verdict: 'rejected', at: new Date(), source: 'manual', ...(why ? { reason: why } : {}) },
    });
    await this.deleteImages(data.mediaUrls ?? []);
    await this.notifyAuthor(
      data,
      recipeId,
      'Receita reprovada',
      `Sua receita "${data.title ?? ''}" foi reprovada por conter conteúdo que não segue as regras do Cooka.${
        why ? ` Motivo: ${why}` : ''
      }`,
    );
  }

  private async notifyAuthor(data: RecipeDoc, recipeId: string, title: string, body: string): Promise<void> {
    try {
      const n = await this.notifications.createNotification(data.authorId, NotificationType.MODERATION, title, body, {
        recipeId,
      });
      await this.notifications.sendPush(data.authorId, n.id, title, body, { recipeId });
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
