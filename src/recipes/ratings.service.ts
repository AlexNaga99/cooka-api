import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { getFirestoreDb } from '../config/firebase.config';
import { toISOString } from '../common/utils/firestore.util';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/dto/notification.dto';
import type { RateResponseDto, CommentResponseDto, CommentListResponseDto } from './dto/rate-comment.dto';
import type { User } from '../models/user.model';

const COMMENTS_COLLECTION = 'comments';
const IN_QUERY_LIMIT = 30;

@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);
  constructor(
    private readonly authService: AuthService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private get db() {
    return getFirestoreDb();
  }

  async getComments(
    recipeId: string,
    limit: number,
    cursor?: string | null,
  ): Promise<CommentListResponseDto> {
    const recipe = await this.db.collection('recipes').doc(recipeId).get();
    if (!recipe.exists) throw new NotFoundException('Receita não encontrada');

    let query = this.db
      .collection(COMMENTS_COLLECTION)
      .where('recipeId', '==', recipeId)
      .where('parentId', '==', null)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);
    if (cursor) {
      const cursorDoc = await this.db.collection(COMMENTS_COLLECTION).doc(cursor).get();
      if (cursorDoc.exists) {
        const createdAt = (cursorDoc.data() as { createdAt?: unknown })?.createdAt;
        query = query.startAfter(createdAt).limit(limit + 1);
      }
    }
    const snapshot = await query.get();
    const rootDocs = snapshot.docs.slice(0, limit);
    const hasMore = snapshot.docs.length > limit;
    const nextCursor = hasMore && rootDocs.length ? rootDocs[rootDocs.length - 1].id : null;
    const rootIds = rootDocs.map((d) => d.id);
    const allDescendants = await this.loadAllDescendants(recipeId, rootIds);
    const repliesByParent = new Map<string, CommentResponseDto[]>();
    for (const c of allDescendants) {
      const pid = c.parentId ?? '';
      const list = repliesByParent.get(pid) ?? [];
      list.push(c);
      repliesByParent.set(pid, list);
    }
    const buildTree = (comment: CommentResponseDto): CommentResponseDto => {
      const children = (repliesByParent.get(comment.id) ?? [])
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return {
        ...comment,
        replies: children.map(buildTree),
        repliesCount: children.length,
      };
    };
    const items: CommentResponseDto[] = [];
    for (const d of rootDocs) {
      const data = d.data() as {
        recipeId: string;
        authorId: string;
        text: string;
        createdAt: unknown;
        parentId?: string | null;
      };
      const author = await this.loadAuthor(data.authorId);
      const rootComment: CommentResponseDto = {
        id: d.id,
        recipeId: data.recipeId,
        authorId: data.authorId,
        text: data.text,
        createdAt: toISOString(data.createdAt),
        author,
      };
      items.push(buildTree(rootComment));
    }
    return { items, nextCursor, hasMore };
  }

  /** Carrega todos os comentários que são descendentes dos IDs dados (respostas em qualquer nível). */
  private async loadAllDescendants(
    recipeId: string,
    rootIds: string[],
  ): Promise<CommentResponseDto[]> {
    const result: CommentResponseDto[] = [];
    let levelIds = [...rootIds];
    while (levelIds.length > 0) {
      const nextIds: string[] = [];
      for (let i = 0; i < levelIds.length; i += IN_QUERY_LIMIT) {
        const chunk = levelIds.slice(i, i + IN_QUERY_LIMIT);
        const snapshot = await this.db
          .collection(COMMENTS_COLLECTION)
          .where('recipeId', '==', recipeId)
          .where('parentId', 'in', chunk)
          .orderBy('createdAt', 'asc')
          .get();
        for (const d of snapshot.docs) {
          const data = d.data() as {
            recipeId: string;
            authorId: string;
            text: string;
            createdAt: unknown;
            parentId: string;
          };
          const author = await this.loadAuthor(data.authorId);
          result.push({
            id: d.id,
            recipeId: data.recipeId,
            authorId: data.authorId,
            text: data.text,
            createdAt: toISOString(data.createdAt),
            author,
            parentId: data.parentId,
          });
          nextIds.push(d.id);
        }
      }
      levelIds = nextIds;
    }
    return result;
  }

  private async loadAuthor(authorId: string): Promise<CommentResponseDto['author']> {
    const userDoc = await this.db.collection('users').doc(authorId).get();
    return userDoc.exists
      ? this.authService.toUserResponse(
          userDoc.data() as User & { createdAt?: { toDate: () => Date } },
          authorId,
        )
      : undefined;
  }

  /**
   * Retorna as avaliações do usuário para várias receitas em uma única consulta.
   * Útil para listagens (feed, busca) onde se precisa de myRating em lote.
   * Firestore limita 'in' a 30 itens; receitas excedentes não terão rating no mapa.
   */
  async getMyRatingsForRecipes(
    recipeIds: string[],
    userId: string,
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!recipeIds.length) return map;
    const slice = recipeIds.slice(0, IN_QUERY_LIMIT);
    const snapshot = await this.db
      .collection('ratings')
      .where('userId', '==', userId)
      .where('recipeId', 'in', slice)
      .get();
    for (const d of snapshot.docs) {
      const data = d.data() as { recipeId: string; stars: number };
      map.set(data.recipeId, data.stars);
    }
    return map;
  }

  /**
   * Retorna a avaliação do usuário na receita, se existir.
   * Um usuário só pode ter uma avaliação por receita (create ou update, nunca duplicar).
   */
  async getMyRating(recipeId: string, userId: string): Promise<{ stars: number } | null> {
    const recipe = await this.db.collection('recipes').doc(recipeId).get();
    if (!recipe.exists) throw new NotFoundException('Receita não encontrada');

    const snapshot = await this.db
      .collection('ratings')
      .where('recipeId', '==', recipeId)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    const data = snapshot.docs[0].data() as { stars: number };
    return { stars: data.stars };
  }

  /**
   * Avalia ou atualiza a avaliação da receita (1–5 estrelas).
   * Um usuário tem no máximo uma avaliação por receita: se já avaliou, atualiza a nota
   * em vez de criar outra. Média e total são mantidos DESNORMALIZADOS no doc da receita
   * (campos `ratingSum` e `ratingsCount`). Isso transforma a operação em O(1) por receita,
   * independente de quantas avaliações ela tem.
   */
  async rate(recipeId: string, userId: string, stars: number): Promise<RateResponseDto> {
    const recipeRef = this.db.collection('recipes').doc(recipeId);
    const recipe = await recipeRef.get();
    if (!recipe.exists) throw new NotFoundException('Receita não encontrada');

    const recipeData = recipe.data() as {
      authorId?: string;
      title?: string;
      ratingSum?: number;
      ratingsCount?: number;
    };
    const currentSum = recipeData.ratingSum ?? 0;
    const currentCount = recipeData.ratingsCount ?? 0;

    const existingRating = await this.db
      .collection('ratings')
      .where('recipeId', '==', recipeId)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    const isNew = existingRating.empty;
    let newSum: number;
    let newCount: number;
    if (isNew) {
      newSum = currentSum + stars;
      newCount = currentCount + 1;
    } else {
      const oldStars = (existingRating.docs[0].data() as { stars: number }).stars;
      newSum = currentSum - oldStars + stars;
      newCount = currentCount;
    }
    const newAvg = newCount > 0 ? newSum / newCount : 0;

    const batch = this.db.batch();
    if (isNew) {
      const ratingRef = this.db.collection('ratings').doc();
      batch.set(ratingRef, { recipeId, userId, stars });
    } else {
      batch.update(existingRating.docs[0].ref, { stars });
    }
    batch.update(recipeRef, {
      ratingSum: newSum,
      ratingsCount: newCount,
      ratingAvg: newAvg,
    });
    await batch.commit();

    if (isNew) {
      const authorId = recipeData.authorId;
      if (authorId && authorId !== userId) {
        const raterProfile = await this.authService.toUserResponse(
          { createdAt: new Date() } as User,
          userId,
        );
        const recipeTitle = recipeData.title ?? 'sua receita';
        this.notificationsService.createNotification(
          authorId,
          NotificationType.RATING,
          'Nova avaliação',
          `${raterProfile.name} avaliou "${recipeTitle}" com ${stars} estrelas`,
          { recipeId },
        ).catch((err) => this.logger.error('Erro ao criar notificação de avaliação', err));
      }
    }

    return { recipeId, userId, stars, ratingAvg: newAvg, ratingsCount: newCount };
  }

  async comment(
    recipeId: string,
    authorId: string,
    text: string,
    parentId?: string | null,
  ): Promise<CommentResponseDto> {
    const recipe = await this.db.collection('recipes').doc(recipeId).get();
    if (!recipe.exists) throw new NotFoundException('Receita não encontrada');

    const recipeData = recipe.data() as { authorId?: string; title?: string };

    let effectiveParentId: string | null = null;
    let notifyUserId: string | null = null;
    let commentAuthorName: string | undefined;
    if (parentId) {
      const parentDoc = await this.db.collection(COMMENTS_COLLECTION).doc(parentId).get();
      if (!parentDoc.exists)
        throw new BadRequestException('Comentário pai não encontrado');
      const parentData = parentDoc.data() as { recipeId?: string; authorId?: string };
      if (parentData.recipeId !== recipeId)
        throw new BadRequestException('Comentário pai não pertence a esta receita');
      effectiveParentId = parentId;
      notifyUserId = parentData.authorId ?? null;
    } else {
      notifyUserId = recipeData.authorId ?? null;
    }

    const ref = this.db.collection(COMMENTS_COLLECTION).doc();
    const now = new Date();
    await ref.set({
      recipeId,
      authorId,
      text,
      createdAt: now,
      parentId: effectiveParentId,
    });

    const author = await this.loadAuthor(authorId);
    const result: CommentResponseDto = {
      id: ref.id,
      recipeId,
      authorId,
      text,
      createdAt: now.toISOString(),
      author,
    };
    if (effectiveParentId) result.parentId = effectiveParentId;

    if (notifyUserId && notifyUserId !== authorId) {
      const authorProfile = await this.loadAuthor(authorId);
      const recipeTitle = recipeData.title ?? 'sua receita';
      const authorName = authorProfile?.name ?? 'Alguém';
      this.notificationsService.createNotification(
        notifyUserId,
        NotificationType.COMMENT,
        'Novo comentário',
        `${authorName} comentou em "${recipeTitle}"`,
        { recipeId },
      ).catch((err) => this.logger.error('Erro ao criar notificação de comentário', err));
    }

    return result;
  }
}
