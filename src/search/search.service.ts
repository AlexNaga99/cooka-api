import { Injectable, Logger } from '@nestjs/common';
import { getFirestoreDb } from '../config/firebase.config';
import { AuthService } from '../auth/auth.service';
import { RecipesService } from '../recipes/recipes.service';
import { User } from '../models/user.model';
import type { SearchResponseDto } from './dto/search.dto';
import type { RecipeResponseDto } from '../recipes/dto/recipe.dto';
import type { UserProfileResponseDto } from '../social/dto/social.dto';

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
    requestUserId?: string,
  ): Promise<SearchResponseDto> {
    const q = (query ?? '').trim().toLowerCase();
    const hasQuery = q.length > 0;
    const hasRecipeFilters = (categoryIds?.length ?? 0) > 0 || (tagIds?.length ?? 0) > 0;

    this.logger.log(
      `search() query="${query ?? ''}" q="${q}" hasQuery=${hasQuery} hasRecipeFilters=${hasRecipeFilters} categoryIds=${JSON.stringify(categoryIds)} tagIds=${JSON.stringify(tagIds)} limit=${limit}`,
    );

    let recipes: RecipeResponseDto[] = [];
    let users: UserProfileResponseDto[] = [];
    let recipeNextCursor: string | null = null;

    if (hasQuery || hasRecipeFilters) {
      const feed = await this.recipesService.findRecipesFiltered(
        q,
        limit,
        cursor,
        categoryIds,
        tagIds,
        requestUserId,
      );
      recipes = feed.items;
      recipeNextCursor = feed.nextCursor ?? null;
      this.logger.log(
        `search() recipeResults.length=${recipes.length} recipeNextCursor=${recipeNextCursor ?? 'null'}`,
      );
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
}
