import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { getFirestoreDb } from '../config/firebase.config';
import { Recipe, User } from '../models';
import { toISOString } from '../common/utils/firestore.util';
import { AuthService } from '../auth/auth.service';
import { CategoriesTagsService } from '../categories-tags/categories-tags.service';
import type {
  RecipeCreateRequestDto,
  RecipeResponseDto,
  RecipeFeedResponseDto,
  RecipeUpdateRequestDto,
} from './dto/recipe.dto';
import type { UserResponseDto } from '../auth/dto/auth-verify.dto';

const DEFAULT_STATUS = 'published';

@Injectable()
export class RecipesService {
  constructor(
    private readonly authService: AuthService,
    private readonly categoriesTagsService: CategoriesTagsService,
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
      popularityScore: 0,
      status,
      createdAt: now,
    };
    await ref.set(data);
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
    return this.toRecipeResponse({ ...data, id: doc.id, status }, author);
  }

  async getFeed(limit: number, cursor?: string | null): Promise<RecipeFeedResponseDto> {
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
    const items: RecipeResponseDto[] = [];
    for (const d of docs) {
      const data = d.data() as Recipe & { createdAt?: unknown };
      const author = await this.getAuthor(data.authorId);
      items.push(this.toRecipeResponse({ ...data, id: d.id, status: DEFAULT_STATUS }, author));
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
    const data = doc.data() as { authorId: string };
    if (data.authorId !== uid) {
      throw new ForbiddenException('Apenas o autor pode excluir esta receita');
    }
    await ref.delete();
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
      popularityScore: 0,
      status: DEFAULT_STATUS,
      createdAt: now,
    };
    await ref.set(data);
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
      status: (recipe.status as 'published' | 'draft') ?? DEFAULT_STATUS,
      createdAt: toISOString(recipe.createdAt),
      author,
    };
  }
}
