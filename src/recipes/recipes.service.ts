import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestoreDb } from '../config/firebase.config';
import { Recipe, User } from '../models';
import { toISOString } from '../common/utils/firestore.util';
import { AuthService } from '../auth/auth.service';
import type { UserResponseDto } from '../auth/dto/auth-verify.dto';
import { CategoriesTagsService } from '../categories-tags/categories-tags.service';
import { RatingsService } from './ratings.service';
import type {
  RecipeCreateRequestDto,
  RecipeResponseDto,
  RecipeFeedResponseDto,
  RecipeUpdateRequestDto,
} from './dto/recipe.dto';

const DEFAULT_STATUS = 'published';
const MAX_ARRAY_CONTAINS_ANY = 30;
const SEARCH_TITLE_BATCH_SIZE = 500;

@Injectable()
export class RecipesService {
  constructor(
    private readonly authService: AuthService,
    private readonly categoriesTagsService: CategoriesTagsService,
    private readonly ratingsService: RatingsService,
  ) {}

  private get db() {
    return getFirestoreDb();
  }

  private async validateCategoryAndTagIds(
    categoryIds?: string[],
    tagIds?: string[],
  ): Promise<void> {
    if (categoryIds?.length) {
      const valid = await this.categoriesTagsService.getCategories();
      const validIds = new Set(valid.map((c) => c.id));
      const invalid = categoryIds.filter((id) => !validIds.has(id));
      if (invalid.length) {
        throw new BadRequestException(`Categorias inválidas: ${invalid.join(', ')}`);
      }
    }
    if (tagIds?.length) {
      const valid = await this.categoriesTagsService.getTags();
      const validIds = new Set(valid.map((t) => t.id));
      const invalid = tagIds.filter((id) => !validIds.has(id));
      if (invalid.length) {
        throw new BadRequestException(`Tags inválidas: ${invalid.join(', ')}`);
      }
    }
  }

  async create(authorId: string, dto: RecipeCreateRequestDto): Promise<RecipeResponseDto> {
    await this.validateCategoryAndTagIds(dto.categories, dto.tags);
    const status = dto.status ?? DEFAULT_STATUS;
    const ref = this.db.collection('recipes').doc();
    const now = new Date();
    const ingredients = dto.ingredients ?? null;
    const preparationSteps = dto.preparationSteps ?? null;
    const description =
      dto.description ?? ([ingredients, preparationSteps].filter(Boolean).join('\n\n') || '');
    const data = {
      authorId,
      title: dto.title,
      titleLower: dto.title.trim().toLowerCase(),
      description,
      ingredients,
      preparationSteps,
      mediaUrls: dto.mediaUrls ?? [],
      videoUrl: dto.videoUrl ?? null,
      categories: dto.categories ?? [],
      tags: dto.tags ?? [],
      isVariation: false,
      parentRecipeId: null,
      ratingAvg: 0,
      ratingsCount: 0,
      ratingSum: 0,
      popularityScore: 0,
      status,
      createdAt: now,
    };

    // Incremento desnormalizado do contador de receitas do autor.
    // FieldValue.increment é atômico no Firestore.
    const batch = this.db.batch();
    batch.set(ref, data);
    batch.set(
      this.db.collection('users').doc(authorId),
      { recipesCount: FieldValue.increment(1) },
      { merge: true },
    );
    await batch.commit();
    return this.getById(ref.id, authorId);
  }

  async getById(id: string, requestUserId?: string): Promise<RecipeResponseDto> {
    const doc = await this.db.collection('recipes').doc(id).get();
    if (!doc.exists) throw new NotFoundException('Receita não encontrada');
    const data = doc.data() as Recipe & { createdAt?: unknown; status?: string };
    const status = data.status ?? DEFAULT_STATUS;
    if (status === 'draft' && data.authorId !== requestUserId) {
      throw new NotFoundException('Receita não encontrada');
    }
    const author = await this.getAuthor(data.authorId);
    let myRating: number | null = null;
    if (requestUserId) {
      const rating = await this.ratingsService.getMyRating(id, requestUserId);
      myRating = rating?.stars ?? null;
    }
    return this.toRecipeResponse({ ...data, id: doc.id, status }, author, myRating);
  }

  /**
   * Busca várias receitas por ID (ex.: tela de favoritos).
   * Retorna na mesma ordem dos ids; omite receitas não encontradas ou inacessíveis (rascunho de outro).
   * Opcionalmente filtra por query (nome), categoryIds, tagIds e aplica limit.
   */
  async getByIds(
    ids: string[],
    requestUserId?: string,
    filters?: {
      query?: string;
      categoryIds?: string[];
      tagIds?: string[];
      limit?: number;
    },
  ): Promise<RecipeResponseDto[]> {
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (uniqueIds.length === 0) return [];

    // Batch read: 1 round-trip em vez de N.
    const refs = uniqueIds.map((id) => this.db.collection('recipes').doc(id));
    const docs = await this.db.getAll(...refs);

    // Carrega autores em batch também (evita N+1 no getAuthor).
    const authorIds = Array.from(
      new Set(
        docs
          .filter((d) => d.exists)
          .map((d) => (d.data() as { authorId?: string })?.authorId)
          .filter((x): x is string => Boolean(x)),
      ),
    );
    const authorRefs = authorIds.map((aid) => this.db.collection('users').doc(aid));
    const authorDocs = authorIds.length > 0 ? await this.db.getAll(...authorRefs) : [];
    const authorById = new Map<string, UserResponseDto>();
    authorDocs.forEach((udoc, idx) => {
      if (!udoc.exists) return;
      const authorId = authorIds[idx];
      const authorData = udoc.data() as User & { createdAt?: { toDate: () => Date }; deletedAt?: unknown };
      if (authorData.deletedAt) return;
      authorById.set(
        authorId,
        this.authService.toUserResponse(authorData, authorId),
      );
    });

    // myRatings em batch
    const myRatingsMap = requestUserId
      ? await this.ratingsService.getMyRatingsForRecipes(
          docs.filter((d) => d.exists).map((d) => d.id),
          requestUserId,
        )
      : new Map<string, number>();

    const results: RecipeResponseDto[] = [];
    for (const doc of docs) {
      if (!doc.exists) continue;
      const data = doc.data() as Recipe & { createdAt?: unknown; status?: string; authorId: string };
      const status = data.status ?? DEFAULT_STATUS;
      if (status === 'draft' && data.authorId !== requestUserId) continue;
      const author = authorById.get(data.authorId);
      const myRating = myRatingsMap.get(doc.id) ?? null;
      results.push(this.toRecipeResponse({ ...data, id: doc.id, status }, author, myRating));
    }

    if (!filters) return results;

    let filtered = results;
    const q = (filters.query ?? '').trim().toLowerCase();
    if (q.length > 0) {
      filtered = filtered.filter((r) => (r.title ?? '').toLowerCase().includes(q));
    }
    if (filters.categoryIds?.length) {
      const catSet = new Set(filters.categoryIds);
      filtered = filtered.filter((r) =>
        (r.categories ?? []).some((c: string) => catSet.has(c)),
      );
    }
    if (filters.tagIds?.length) {
      const tagSet = new Set(filters.tagIds);
      filtered = filtered.filter((r) =>
        (r.tags ?? []).some((t: string) => tagSet.has(t)),
      );
    }
    const limit = filters.limit ?? filtered.length;
    return filtered.slice(0, limit);
  }

  async getFeed(
    limit: number,
    cursor?: string | null,
    requestUserId?: string,
  ): Promise<RecipeFeedResponseDto> {
    let query = this.db
      .collection('recipes')
      .where('status', '==', DEFAULT_STATUS)
      .orderBy('popularityScore', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);
    if (cursor) {
      const cursorDoc = await this.db.collection('recipes').doc(cursor).get();
      if (cursorDoc.exists) {
        const cursorData = cursorDoc.data();
        const popularityScore = (cursorData as { popularityScore?: number })?.popularityScore ?? 0;
        const createdAt = (cursorData as { createdAt?: unknown })?.createdAt;
        query = query.startAfter(popularityScore, createdAt).limit(limit + 1);
      }
    }
    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, limit);
    const hasMore = snapshot.docs.length > limit;
    const nextCursor = hasMore && docs.length ? docs[docs.length - 1].id : null;
    const recipeIds = docs.map((d) => d.id);
    const myRatingsMap = requestUserId
      ? await this.ratingsService.getMyRatingsForRecipes(recipeIds, requestUserId)
      : new Map<string, number>();
    const items: RecipeResponseDto[] = [];
    for (const d of docs) {
      const data = d.data() as Recipe & { createdAt?: unknown };
      const author = await this.getAuthor(data.authorId);
      const myRating = myRatingsMap.get(d.id) ?? null;
      items.push(
        this.toRecipeResponse(
          { ...data, id: d.id, status: DEFAULT_STATUS },
          author,
          myRating ?? undefined,
        ),
      );
    }
    return { items, nextCursor, hasMore };
  }

  async getByAuthorId(
    authorId: string,
    requestUserId: string | undefined,
    limit: number,
    cursor?: string | null,
    status?: 'published' | 'draft',
  ): Promise<RecipeFeedResponseDto> {
    const isOwn = requestUserId === authorId;
    const effectiveStatus = status ?? 'published';
    if (!isOwn && effectiveStatus === 'draft') {
      return { items: [], nextCursor: null, hasMore: false };
    }
    let query = this.db
      .collection('recipes')
      .where('authorId', '==', authorId)
      .where('status', '==', effectiveStatus)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);
    if (cursor) {
      const cursorDoc = await this.db.collection('recipes').doc(cursor).get();
      if (cursorDoc.exists) {
        const cursorData = cursorDoc.data();
        const createdAt = (cursorData as { createdAt?: unknown })?.createdAt;
        query = query.startAfter(createdAt).limit(limit + 1);
      }
    }
    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, limit);
    const hasMore = snapshot.docs.length > limit;
    const nextCursor = hasMore && docs.length ? docs[docs.length - 1].id : null;
    const items: RecipeResponseDto[] = [];
    for (const d of docs) {
      const data = d.data() as Recipe & { createdAt?: unknown };
      const author = await this.getAuthor(data.authorId);
      items.push(this.toRecipeResponse({ ...data, id: d.id }, author));
    }
    return { items, nextCursor, hasMore };
  }

  /**
   * Lista receitas com filtros opcionais: nome (substring no título), ids de categoria e/ou tags.
   * Sem filtro nem query retorna lista vazia. Paginação via cursor (id da última receita da página).
   * Quando requestUserId é informado, inclui myRating em cada receita (uma consulta em lote).
   */
  async findRecipesFiltered(
    query: string,
    limit: number,
    cursor: string | null,
    categoryIds?: string[],
    tagIds?: string[],
    requestUserId?: string,
  ): Promise<RecipeFeedResponseDto> {
    const q = (query ?? '').trim().toLowerCase();
    const hasQuery = q.length > 0;
    const hasCategoryFilter = (categoryIds?.length ?? 0) > 0;
    const hasTagFilter = (tagIds?.length ?? 0) > 0;

    if (!hasQuery && !hasCategoryFilter && !hasTagFilter) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const { items, nextCursor } = await this.findRecipesFilteredInternal(
      q,
      limit,
      cursor,
      categoryIds,
      tagIds,
      requestUserId,
    );
    return {
      items,
      nextCursor,
      hasMore: nextCursor != null,
    };
  }

  private async findRecipesFilteredInternal(
    q: string,
    limit: number,
    cursor: string | null,
    categoryIds?: string[],
    tagIds?: string[],
    requestUserId?: string,
  ): Promise<{ items: RecipeResponseDto[]; nextCursor: string | null }> {
    const hasQuery = q.length > 0;
    const hasCategoryFilter = (categoryIds?.length ?? 0) > 0;
    const hasTagFilter = (tagIds?.length ?? 0) > 0;

    if (!hasCategoryFilter && !hasTagFilter) {
      return this.findRecipesByTitle(q, limit, cursor, requestUserId);
    }

    const categoryIdsSlice = categoryIds?.slice(0, MAX_ARRAY_CONTAINS_ANY) ?? [];
    const tagIdsSlice = tagIds?.slice(0, MAX_ARRAY_CONTAINS_ANY) ?? [];
    const filterLimit = limit + 1;
    let docs: QueryDocumentSnapshot[] = [];

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

    const selected = docs.slice(0, limit);
    const hasMoreInBatch = docs.length > limit;
    const nextCursor =
      hasMoreInBatch && selected.length > 0 ? selected[selected.length - 1].id : null;

    const recipeIds = selected.map((d) => d.id);
    const myRatingsMap = requestUserId
      ? await this.ratingsService.getMyRatingsForRecipes(recipeIds, requestUserId)
      : new Map<string, number>();

    const items: RecipeResponseDto[] = [];
    for (const d of selected) {
      const data = d.data();
      const authorId = (data as { authorId: string }).authorId;
      const author = await this.getAuthor(authorId);
      const myRating = myRatingsMap.get(d.id) ?? null;
      items.push(
        this.toRecipeResponse(
          { ...data, id: d.id, status: DEFAULT_STATUS } as Recipe & {
            id: string;
            createdAt?: unknown;
            status?: string;
          },
          author,
          myRating ?? undefined,
        ),
      );
    }
    return { items, nextCursor };
  }

  /**
   * Requer índice composto no Firestore:
   * recipes: status (Ascending), categories (Ascending), createdAt (Descending)
   * recipes: status (Ascending), tags (Ascending), createdAt (Descending)
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
   * Busca por prefixo no título (case-insensitive) usando índice composto do Firestore.
   * Range query: titleLower >= q && titleLower < q +  ( é o último caractere UTF-8, marca
   * o final exclusivo do intervalo). É o jeito que o Firestore oferece para "começa com".
   *
   * Atenção: NÃO é substring (ex.: query "olo" não encontra "bolo"). Para substring livre,
   * considerar um serviço externo (Algolia/Meilisearch) em uma próxima sprint.
   */
  private async findRecipesByTitle(
    q: string,
    limit: number,
    cursor: string | null,
    requestUserId?: string,
  ): Promise<{ items: RecipeResponseDto[]; nextCursor: string | null }> {
    const end = q + '';
    let query = this.db
      .collection('recipes')
      .where('status', '==', DEFAULT_STATUS)
      .where('titleLower', '>=', q)
      .where('titleLower', '<', end)
      .orderBy('titleLower')
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);

    if (cursor) {
      const cursorDoc = await this.db.collection('recipes').doc(cursor).get();
      if (cursorDoc.exists) {
        const cursorData = cursorDoc.data() as { titleLower?: string; createdAt?: unknown };
        query = query.startAfter(cursorData.titleLower ?? '', cursorData.createdAt);
      }
    }
    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, limit);
    const hasMore = snapshot.docs.length > limit;
    const nextCursor =
      hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

    const recipeIds = docs.map((d) => d.id);
    const myRatingsMap = requestUserId
      ? await this.ratingsService.getMyRatingsForRecipes(recipeIds, requestUserId)
      : new Map<string, number>();

    const items: RecipeResponseDto[] = [];
    for (const d of docs) {
      const data = d.data();
      const authorId = (data as { authorId: string }).authorId;
      const author = await this.getAuthor(authorId);
      const myRating = myRatingsMap.get(d.id) ?? null;
      items.push(
        this.toRecipeResponse(
          { ...data, id: d.id, status: DEFAULT_STATUS } as Recipe & {
            id: string;
            createdAt?: unknown;
            status?: string;
          },
          author,
          myRating ?? undefined,
        ),
      );
    }
    return { items, nextCursor };
  }

  async update(
    id: string,
    uid: string,
    dto: RecipeUpdateRequestDto,
  ): Promise<RecipeResponseDto> {
    const ref = this.db.collection('recipes').doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException('Receita não encontrada');
    const data = doc.data() as { authorId: string };
    if (data.authorId !== uid) {
      throw new ForbiddenException('Apenas o autor pode editar esta receita');
    }
    await this.validateCategoryAndTagIds(dto.categories, dto.tags);
    const updates: Record<string, unknown> = {};
    if (dto.title !== undefined) {
      updates.title = dto.title;
      updates.titleLower = dto.title.trim().toLowerCase();
    }
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.ingredients !== undefined) updates.ingredients = dto.ingredients;
    if (dto.preparationSteps !== undefined) updates.preparationSteps = dto.preparationSteps;
    if (dto.mediaUrls !== undefined) updates.mediaUrls = dto.mediaUrls;
    if (dto.videoUrl !== undefined) updates.videoUrl = dto.videoUrl;
    if (dto.categories !== undefined) updates.categories = dto.categories;
    if (dto.tags !== undefined) updates.tags = dto.tags;
    if (dto.status !== undefined) updates.status = dto.status;
    if (Object.keys(updates).length === 0) {
      return this.getById(id, uid);
    }
    await ref.update(updates);
    return this.getById(id, uid);
  }

  async delete(id: string, uid: string): Promise<void> {
    const ref = this.db.collection('recipes').doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException('Receita não encontrada');
    const data = doc.data() as { authorId: string; status?: string };
    if (data.authorId !== uid) {
      throw new ForbiddenException('Apenas o autor pode excluir esta receita');
    }

    const batch = this.db.batch();
    batch.delete(ref);
    // Só decrementa contador se a receita era publicada (drafts não contam).
    if ((data.status ?? DEFAULT_STATUS) === DEFAULT_STATUS) {
      batch.set(
        this.db.collection('users').doc(uid),
        { recipesCount: FieldValue.increment(-1) },
        { merge: true },
      );
    }
    await batch.commit();
  }

  async createVariation(
    parentId: string,
    authorId: string,
    dto: RecipeCreateRequestDto,
  ): Promise<RecipeResponseDto> {
    const parent = await this.db.collection('recipes').doc(parentId).get();
    if (!parent.exists) throw new NotFoundException('Receita original não encontrada');
    const parentData = parent.data() as { status?: string };
    if ((parentData.status ?? DEFAULT_STATUS) === 'draft') {
      throw new BadRequestException('Não é possível criar variação de rascunho');
    }
    await this.validateCategoryAndTagIds(dto.categories, dto.tags);
    const ref = this.db.collection('recipes').doc();
    const now = new Date();
    const ingredients = dto.ingredients ?? null;
    const preparationSteps = dto.preparationSteps ?? null;
    const description =
      dto.description ?? ([ingredients, preparationSteps].filter(Boolean).join('\n\n') || '');
    const data = {
      authorId,
      title: dto.title,
      titleLower: dto.title.trim().toLowerCase(),
      description,
      ingredients,
      preparationSteps,
      mediaUrls: dto.mediaUrls ?? [],
      videoUrl: dto.videoUrl ?? null,
      categories: dto.categories ?? [],
      tags: dto.tags ?? [],
      isVariation: true,
      parentRecipeId: parentId,
      ratingAvg: 0,
      ratingsCount: 0,
      ratingSum: 0,
      popularityScore: 0,
      status: DEFAULT_STATUS,
      createdAt: now,
    };

    const batch = this.db.batch();
    batch.set(ref, data);
    batch.set(
      this.db.collection('users').doc(authorId),
      { recipesCount: FieldValue.increment(1) },
      { merge: true },
    );
    await batch.commit();
    return this.getById(ref.id, authorId);
  }

  private async getAuthor(authorId: string): Promise<UserResponseDto | undefined> {
    const userDoc = await this.db.collection('users').doc(authorId).get();
    if (!userDoc.exists) return undefined;
    const data = userDoc.data() as User & { createdAt?: unknown };
    return this.authService.toUserResponse(data as User & { createdAt?: { toDate: () => Date } }, authorId);
  }

  toRecipeResponse(
    recipe: Recipe & { id: string; createdAt?: unknown; status?: string },
    author?: UserResponseDto,
    myRating?: number | null,
  ): RecipeResponseDto {
    return {
      id: recipe.id,
      authorId: recipe.authorId,
      title: recipe.title,
      description: recipe.description ?? '',
      ingredients: recipe.ingredients ?? null,
      preparationSteps: recipe.preparationSteps ?? null,
      mediaUrls: recipe.mediaUrls ?? [],
      videoUrl: recipe.videoUrl ?? null,
      categories: recipe.categories ?? [],
      tags: recipe.tags ?? [],
      isVariation: recipe.isVariation ?? false,
      parentRecipeId: recipe.parentRecipeId ?? null,
      ratingAvg: recipe.ratingAvg ?? 0,
      ratingsCount: recipe.ratingsCount ?? 0,
      ratingSum: recipe.ratingSum ?? 0,
      myRating: myRating ?? null,
      status: (recipe.status as 'published' | 'draft') ?? DEFAULT_STATUS,
      createdAt: toISOString(recipe.createdAt),
      author,
    };
  }
}
