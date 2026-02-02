import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { getFirestoreDb } from '../config/firebase.config';
import { Recipe, User } from '../models';
import { toISOString } from '../common/utils/firestore.util';
import { AuthService } from '../auth/auth.service';
import type { RecipeCreateRequestDto, RecipeResponseDto, RecipeFeedResponseDto } from './dto/recipe.dto';
import type { UserResponseDto } from '../auth/dto/auth-verify.dto';

@Injectable()
export class RecipesService {
  constructor(private readonly authService: AuthService) {}

  private get db() {
    return getFirestoreDb();
  }

  async create(authorId: string, dto: RecipeCreateRequestDto): Promise<RecipeResponseDto> {
    const ref = this.db.collection('recipes').doc();
    const now = new Date();
    const data = {
      authorId,
      title: dto.title,
      description: dto.description,
      mediaUrls: dto.mediaUrls ?? [],
      videoUrl: dto.videoUrl ?? null,
      categories: dto.categories ?? [],
      tags: dto.tags ?? [],
      isVariation: false,
      parentRecipeId: null,
      ratingAvg: 0,
      ratingsCount: 0,
      popularityScore: 0,
      createdAt: now,
    };
    await ref.set(data);
    return this.getById(ref.id, authorId);
  }

  async getById(id: string, requestUserId?: string): Promise<RecipeResponseDto> {
    const doc = await this.db.collection('recipes').doc(id).get();
    if (!doc.exists) throw new NotFoundException('Receita não encontrada');
    const data = doc.data() as Recipe & { createdAt?: unknown };
    const author = await this.getAuthor(data.authorId);
    return this.toRecipeResponse({ ...data, id: doc.id }, author);
  }

  async getFeed(limit: number, cursor?: string | null): Promise<RecipeFeedResponseDto> {
    let query = this.db
      .collection('recipes')
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
      items.push(this.toRecipeResponse({ ...data, id: d.id }, author));
    }
    return { items, nextCursor, hasMore };
  }

  async createVariation(
    parentId: string,
    authorId: string,
    dto: RecipeCreateRequestDto,
  ): Promise<RecipeResponseDto> {
    const parent = await this.db.collection('recipes').doc(parentId).get();
    if (!parent.exists) throw new NotFoundException('Receita original não encontrada');
    const ref = this.db.collection('recipes').doc();
    const now = new Date();
    const data = {
      authorId,
      title: dto.title,
      description: dto.description,
      mediaUrls: dto.mediaUrls ?? [],
      videoUrl: dto.videoUrl ?? null,
      categories: dto.categories ?? [],
      tags: dto.tags ?? [],
      isVariation: true,
      parentRecipeId: parentId,
      ratingAvg: 0,
      ratingsCount: 0,
      popularityScore: 0,
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
    recipe: Recipe & { id: string; createdAt?: unknown },
    author?: UserResponseDto,
  ): RecipeResponseDto {
    return {
      id: recipe.id,
      authorId: recipe.authorId,
      title: recipe.title,
      description: recipe.description,
      mediaUrls: recipe.mediaUrls ?? [],
      videoUrl: recipe.videoUrl ?? null,
      categories: recipe.categories ?? [],
      tags: recipe.tags ?? [],
      isVariation: recipe.isVariation ?? false,
      parentRecipeId: recipe.parentRecipeId ?? null,
      ratingAvg: recipe.ratingAvg ?? 0,
      ratingsCount: recipe.ratingsCount ?? 0,
      createdAt: toISOString(recipe.createdAt),
      author,
    };
  }
}
