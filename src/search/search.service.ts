import { Injectable } from '@nestjs/common';
import { getFirestoreDb } from '../config/firebase.config';
import { AuthService } from '../auth/auth.service';
import { RecipesService } from '../recipes/recipes.service';
import { User } from '../models/user.model';
import type { SearchResponseDto } from './dto/search.dto';
import type { RecipeResponseDto } from '../recipes/dto/recipe.dto';
import type { UserProfileResponseDto } from '../social/dto/social.dto';

@Injectable()
export class SearchService {
  constructor(
    private readonly authService: AuthService,
    private readonly recipesService: RecipesService,
  ) {}

  private get db() {
    return getFirestoreDb();
  }

  async search(
    query: string,
    _filters: string | undefined,
    limit: number,
    cursor?: string | null,
  ): Promise<SearchResponseDto> {
    const q = (query ?? '').trim().toLowerCase();
    const recipes: RecipeResponseDto[] = [];
    const users: UserProfileResponseDto[] = [];

    if (q.length > 0) {
      const [recipesSnapshot, usersSnapshot] = await Promise.all([
        this.db
          .collection('recipes')
          .orderBy('title')
          .startAt(q)
          .endAt(q + '\uf8ff')
          .limit(limit)
          .get(),
        this.db
          .collection('users')
          .orderBy('name')
          .startAt(q)
          .endAt(q + '\uf8ff')
          .limit(limit)
          .get(),
      ]);

      for (const d of recipesSnapshot.docs) {
        const data = d.data();
        const authorId = (data as { authorId: string }).authorId;
        const userDoc = await this.db.collection('users').doc(authorId).get();
        const author = userDoc.exists
          ? this.authService.toUserResponse(userDoc.data() as User & { createdAt?: { toDate: () => Date } }, authorId)
          : undefined;
        recipes.push(
          this.recipesService.toRecipeResponse(
            { ...data, id: d.id } as Parameters<RecipesService['toRecipeResponse']>[0],
            author,
          ),
        );
      }

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
}
