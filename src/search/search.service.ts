import { Injectable, Logger } from '@nestjs/common';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getFirestoreDb } from '../config/firebase.config';
import { AuthService } from '../auth/auth.service';
import { RecipesService } from '../recipes/recipes.service';
import { User } from '../models/user.model';
import type { SearchResponseDto } from './dto/search.dto';
import type { RecipeResponseDto } from '../recipes/dto/recipe.dto';
import type { UserProfileResponseDto } from '../social/dto/social.dto';

const DEFAULT_STATUS = 'published';
const MAX_ARRAY_CONTAINS_ANY = 30;
/** Quantidade máxima de receitas publicadas buscadas para filtrar por substring no título. */
const SEARCH_TITLE_BATCH_SIZE = 500;

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly recipesService: RecipesService,
  ) {}

  private get db() {
    return getFirestoreDb();
  }

  async search(
    query: string,
    limit: number,
    cursor: string | null,
    categoryIds?: string[],
    tagIds?: string[],
  ): Promise<SearchResponseDto> {
    const q = (query ?? '').trim().toLowerCase();
    const hasQuery = q.length > 0;
    const hasRecipeFilters = (categoryIds?.length ?? 0) > 0 || (tagIds?.length ?? 0) > 0;

    this.logger.log(
      `search() query="${query ?? ''}" q="${q}" hasQuery=${hasQuery} hasRecipeFilters=${hasRecipeFilters} categoryIds=${JSON.stringify(categoryIds)} tagIds=${JSON.stringify(tagIds)} limit=${limit}`,
    );

    const recipes: RecipeResponseDto[] = [];
    let users: UserProfileResponseDto[] = [];

    let recipeNextCursor: string | null = null;

    if (hasQuery || hasRecipeFilters) {
      const { recipes: recipeResults, nextCursor: recipeCursor } =
        await this.searchRecipes(q, limit, cursor, categoryIds, tagIds);
      this.logger.log(`search() recipeResults.length=${recipeResults.length} recipeNextCursor=${recipeCursor ?? 'null'}`);
      recipes.push(...recipeResults);
      recipeNextCursor = recipeCursor;
    }

    if (hasQuery) {
      const usersSnapshot = await this.db
        .collection('users')
        .orderBy('name')
        .startAt(q)
        .endAt(q + '\uf8ff')
        .limit(limit)
        .get();
      for (const d of usersSnapshot.docs) {
        const data = d.data() as User & { createdAt?: { toDate: () => Date } };
        users.push(
          this.authService.toUserResponse(data, d.id) as UserProfileResponseDto,
        );
      }
    }

    const hasMore = recipes.length >= limit || users.length >= limit;
    const nextCursor =
      recipes.length >= limit && recipeNextCursor != null
        ? recipeNextCursor
        : null;

    return {
      recipes,
      users,
      nextCursor,
      hasMore,
    };
  }

  private async searchRecipes(
    q: string,
    limit: number,
    cursor: string | null,
    categoryIds?: string[],
    tagIds?: string[],
  ): Promise<{ recipes: RecipeResponseDto[]; nextCursor: string | null }> {
    const hasQuery = q.length > 0;
    const hasCategoryFilter = (categoryIds?.length ?? 0) > 0;
    const hasTagFilter = (tagIds?.length ?? 0) > 0;

    if (!hasQuery && !hasCategoryFilter && !hasTagFilter) {
      return { recipes: [], nextCursor: null };
    }

    if (!hasCategoryFilter && !hasTagFilter) {
      return this.searchRecipesByTitle(q, limit, cursor);
    }

    const categoryIdsSlice = categoryIds?.slice(0, MAX_ARRAY_CONTAINS_ANY) ?? [];
    const tagIdsSlice = tagIds?.slice(0, MAX_ARRAY_CONTAINS_ANY) ?? [];

    let docs: QueryDocumentSnapshot[] = [];

    const filterLimit = limit + 1;

    if (hasCategoryFilter && hasTagFilter) {
      const byCategory = await this.queryRecipesByFilter(
        'categories',
        categoryIdsSlice,
        limit * 5,
        cursor,
      );
      docs = byCategory.filter((d) => {
        const data = d.data();
        const tags = (data.tags as string[] | undefined) ?? [];
        return tagIdsSlice.some((id) => tags.includes(id));
      });
    } else if (hasCategoryFilter) {
      docs = await this.queryRecipesByFilter(
        'categories',
        categoryIdsSlice,
        filterLimit,
        cursor,
      );
    } else {
      docs = await this.queryRecipesByFilter(
        'tags',
        tagIdsSlice,
        filterLimit,
        cursor,
      );
    }

    if (hasQuery) {
      docs = docs.filter((d) => {
        const title = ((d.data().title as string) ?? '').toLowerCase();
        return title.includes(q);
      });
    }

    // Com cursor, a query já retornou a página seguinte (startAfter); sem cursor, primeira página
    const selected = docs.slice(0, limit);
    const hasMoreInBatch = docs.length > limit;
    const nextCursor =
      hasMoreInBatch && selected.length > 0 ? selected[selected.length - 1].id : null;

    const results: RecipeResponseDto[] = [];
    for (const d of selected) {
      const data = d.data();
      const authorId = (data as { authorId: string }).authorId;
      const userDoc = await this.db.collection('users').doc(authorId).get();
      const author = userDoc.exists
        ? this.authService.toUserResponse(
            userDoc.data() as User & { createdAt?: { toDate: () => Date } },
            authorId,
          )
        : undefined;
      results.push(
        this.recipesService.toRecipeResponse(
          { ...data, id: d.id } as Parameters<RecipesService['toRecipeResponse']>[0],
          author,
        ),
      );
    }
    return { recipes: results, nextCursor };
  }

  /**
   * Requer índice composto no Firestore:
   * - recipes: status (Ascending), categories (Ascending), createdAt (Descending)
   * - recipes: status (Ascending), tags (Ascending), createdAt (Descending)
   */
  private async queryRecipesByFilter(
    field: 'categories' | 'tags',
    ids: string[],
    limitCount: number,
    cursor: string | null = null,
  ): Promise<QueryDocumentSnapshot[]> {
    if (ids.length === 0) return [];
    let query = this.db
      .collection('recipes')
      .where('status', '==', DEFAULT_STATUS)
      .where(field, 'array-contains-any', ids)
      .orderBy('createdAt', 'desc')
      .limit(limitCount);

    if (cursor) {
      const cursorDoc = await this.db.collection('recipes').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    return snapshot.docs;
  }

  /**
   * Busca por substring no título (case-insensitive).
   * Busca um lote de receitas publicadas (ordenadas por createdAt) e filtra em memória
   * onde o título contém q. Suporta paginação via cursor (id do último item da página anterior).
   */
  private async searchRecipesByTitle(
    q: string,
    limit: number,
    cursor: string | null,
  ): Promise<{ recipes: RecipeResponseDto[]; nextCursor: string | null }> {
    const snapshot = await this.db
      .collection('recipes')
      .where('status', '==', DEFAULT_STATUS)
      .orderBy('createdAt', 'desc')
      .limit(SEARCH_TITLE_BATCH_SIZE)
      .get();

    const docs = snapshot.docs;
    this.logger.log(
      `searchRecipesByTitle() q="${q}" cursor=${cursor ?? 'null'} fetched ${docs.length} (batch max ${SEARCH_TITLE_BATCH_SIZE})`,
    );

    const filtered = docs.filter((d) => {
      const data = d.data();
      const title = (data.title as string) ?? '';
      const titleLower = (data.titleLower as string) ?? title.toLowerCase();
      const searchable = titleLower || title.toLowerCase();
      return searchable.includes(q);
    });

    let startIndex = 0;
    if (cursor) {
      const cursorIndex = filtered.findIndex((d) => d.id === cursor);
      if (cursorIndex >= 0) startIndex = cursorIndex + 1;
    }

    const selected = filtered.slice(startIndex, startIndex + limit);
    const hasMore = filtered.length > startIndex + limit;
    const nextCursor =
      hasMore && selected.length > 0 ? selected[selected.length - 1].id : null;

    this.logger.log(
      `searchRecipesByTitle() filtered=${filtered.length} startIndex=${startIndex} selected=${selected.length} nextCursor=${nextCursor ?? 'null'}`,
    );

    const results: RecipeResponseDto[] = [];
    for (const d of selected) {
      const data = d.data();
      const authorId = (data as { authorId: string }).authorId;
      const userDoc = await this.db.collection('users').doc(authorId).get();
      const author = userDoc.exists
        ? this.authService.toUserResponse(
            userDoc.data() as User & { createdAt?: { toDate: () => Date } },
            authorId,
          )
        : undefined;
      results.push(
        this.recipesService.toRecipeResponse(
          { ...data, id: d.id } as Parameters<RecipesService['toRecipeResponse']>[0],
          author,
        ),
      );
    }
    return { recipes: results, nextCursor };
  }
}
