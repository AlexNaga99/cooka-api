import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { getFirestoreDb } from '../config/firebase.config';
import { toISOString } from '../common/utils/firestore.util';
import { AuthService } from '../auth/auth.service';
import type { RateResponseDto, CommentResponseDto, CommentListResponseDto } from './dto/rate-comment.dto';
import type { User } from '../models/user.model';

const COMMENTS_COLLECTION = 'comments';
const IN_QUERY_LIMIT = 30;

@Injectable()
export class RatingsService {
  constructor(private readonly authService: AuthService) {}

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
   * em vez de criar outra. A média e o total da receita são recalculados a partir de
   * todas as avaliações (soma das estrelas / quantidade de avaliadores).
   */
  async rate(recipeId: string, userId: string, stars: number): Promise<RateResponseDto> {
    const recipeRef = this.db.collection('recipes').doc(recipeId);
    const recipe = await recipeRef.get();
    if (!recipe.exists) throw new NotFoundException('Receita não encontrada');

    const ratingQuery = await this.db
      .collection('ratings')
      .where('recipeId', '==', recipeId)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    const batch = this.db.batch();

    if (ratingQuery.empty) {
      const ratingRef = this.db.collection('ratings').doc();
      batch.set(ratingRef, { recipeId, userId, stars });
    } else {
      batch.update(ratingQuery.docs[0].ref, { stars });
    }

    const allRatings = await this.db.collection('ratings').where('recipeId', '==', recipeId).get();
    const starValues = allRatings.docs.map((d) => (d.data() as { stars: number }).stars);
    if (!ratingQuery.empty) {
      const existingId = ratingQuery.docs[0].id;
      const idx = allRatings.docs.findIndex((d) => d.id === existingId);
      if (idx >= 0) starValues[idx] = stars;
    } else {
      starValues.push(stars);
    }
    const ratingAvg = starValues.length ? starValues.reduce((a, b) => a + b, 0) / starValues.length : 0;
    const ratingsCount = starValues.length;
    batch.update(recipeRef, { ratingAvg, ratingsCount });
    await batch.commit();

    return { recipeId, userId, stars, ratingAvg, ratingsCount };
  }

  async comment(
    recipeId: string,
    authorId: string,
    text: string,
    parentId?: string | null,
  ): Promise<CommentResponseDto> {
    const recipe = await this.db.collection('recipes').doc(recipeId).get();
    if (!recipe.exists) throw new NotFoundException('Receita não encontrada');

    let effectiveParentId: string | null = null;
    if (parentId) {
      const parentDoc = await this.db.collection(COMMENTS_COLLECTION).doc(parentId).get();
      if (!parentDoc.exists)
        throw new BadRequestException('Comentário pai não encontrado');
      const parentData = parentDoc.data() as { recipeId?: string };
      if (parentData.recipeId !== recipeId)
        throw new BadRequestException('Comentário pai não pertence a esta receita');
      effectiveParentId = parentId;
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
    return result;
  }
}
