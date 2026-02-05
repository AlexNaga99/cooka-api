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

    if (hasQuery || hasRecipeFilters) {
      const recipeResults = await this.searchRecipes(
        q,
        limit,
        categoryIds,
        tagIds,
      );
      this.logger.log(`search() recipeResults.length=${recipeResults.length}`);
      recipes.push(...recipeResults);
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

    return {
      recipes,
      users,
      nextCursor: cursor ?? null,
      hasMore,
    };
  }

  private async searchRecipes(
    q: string,
    limit: number,
    categoryIds?: string[],
    tagIds?: string[],
  ): Promise<RecipeResponseDto[]> {
    const hasQuery = q.length > 0;
    const hasCategoryFilter = (categoryIds?.length ?? 0) > 0;
    const hasTagFilter = (tagIds?.length ?? 0) > 0;

    if (!hasQuery && !hasCategoryFilter && !hasTagFilter) {
      return [];
    }

    if (!hasCategoryFilter && !hasTagFilter) {
      return this.searchRecipesByTitle(q, limit);
    }

    const categoryIdsSlice = categoryIds?.slice(0, MAX_ARRAY_CONTAINS_ANY) ?? [];
    const tagIdsSlice = tagIds?.slice(0, MAX_ARRAY_CONTAINS_ANY) ?? [];

    let docs: QueryDocumentSnapshot[] = [];

    if (hasCategoryFilter && hasTagFilter) {
      const byCategory = await this.queryRecipesByFilter(
        'categories',
        categoryIdsSlice,
        limit * 5,
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
        limit + 1,
      );
    } else {
      docs = await this.queryRecipesByFilter(
        'tags',
        tagIdsSlice,
        limit + 1,
      );
    }

    if (hasQuery) {
      docs = docs.filter((d) => {
        const title = ((d.data().title as string) ?? '').toLowerCase();
        return title.includes(q);
      });
    }

    const toTake = Math.min(docs.length, limit);
    const selected = docs.slice(0, toTake);

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
    return results;
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
  ): Promise<QueryDocumentSnapshot[]> {
    if (ids.length === 0) return [];
    const snapshot = await this.db
      .collection('recipes')
      .where('status', '==', DEFAULT_STATUS)
      .where(field, 'array-contains-any', ids)
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get();
    return snapshot.docs;
  }

  /**
   * Busca por substring no título (case-insensitive).
   * Busca um lote de receitas publicadas (ordenadas por createdAt) e filtra em memória
   * onde o título contém q, para suportar "bolo", "chocolate", "lo de choco", etc.
   * Funciona com ou sem o campo titleLower nas receitas.
   */
  private async searchRecipesByTitle(
    q: string,
    limit: number,
  ): Promise<RecipeResponseDto[]> {
    const snapshot = await this.db
      .collection('recipes')
      .where('status', '==', DEFAULT_STATUS)
      .orderBy('createdAt', 'desc')
      .limit(SEARCH_TITLE_BATCH_SIZE)
      .get();

    const docs = snapshot.docs;
    this.logger.log(
      `searchRecipesByTitle() q="${q}" fetched ${docs.length} published recipes (batch max ${SEARCH_TITLE_BATCH_SIZE})`,
    );
    if (docs.length > 0) {
      const sample = docs.slice(0, 5).map((d) => {
        const data = d.data();
        return { id: d.id, title: data.title, titleLower: data.titleLower };
      });
      this.logger.log(`searchRecipesByTitle() sample docs (first 5): ${JSON.stringify(sample)}`);
    }

    const filtered = docs.filter((d) => {
      const data = d.data();
      const title = (data.title as string) ?? '';
      const titleLower = (data.titleLower as string) ?? title.toLowerCase();
      const searchable = titleLower || title.toLowerCase();
      return searchable.includes(q);
    });

    this.logger.log(
      `searchRecipesByTitle() after filter: ${filtered.length} match(es), taking up to ${limit}`,
    );

    const toTake = Math.min(filtered.length, limit);
    const selected = filtered.slice(0, toTake);

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
    return results;
  }
}
