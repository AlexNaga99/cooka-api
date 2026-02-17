import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { getFirestoreDb, getFirebaseAuth } from '../config/firebase.config';
import { User } from '../models';
import { AuthService } from '../auth/auth.service';
import type {
  UserProfileResponseDto,
  FollowResponseDto,
  CookListResponseDto,
  CookListItemDto,
} from './dto/social.dto';
import type { AccountUpdateRequestDto } from './dto/account.dto';

@Injectable()
export class SocialService {
  constructor(private readonly authService: AuthService) {}

  private get db() {
    return getFirestoreDb();
  }

  private userHasDeleted(data: { deletedAt?: unknown }): boolean {
    return data.deletedAt != null;
  }

  async getProfile(userId: string): Promise<UserProfileResponseDto> {
    const doc = await this.db.collection('users').doc(userId).get();
    if (!doc.exists) throw new NotFoundException('Usuário não encontrado');
    const data = doc.data() as User & { createdAt?: { toDate: () => Date }; deletedAt?: unknown };
    if (this.userHasDeleted(data)) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return this.authService.toUserResponse(data, doc.id) as UserProfileResponseDto;
  }

  async getAccount(uid: string): Promise<UserProfileResponseDto> {
    const doc = await this.db.collection('users').doc(uid).get();
    if (doc.exists) {
      const data = doc.data() as User & { createdAt?: { toDate: () => Date }; deletedAt?: unknown };
      if (this.userHasDeleted(data)) {
        throw new NotFoundException('Conta excluída');
      }
      return this.authService.toUserResponse(data, doc.id) as UserProfileResponseDto;
    }
    const auth = getFirebaseAuth();
    let firebaseUser: { displayName?: string; email?: string; photoURL?: string };
    try {
      firebaseUser = await auth.getUser(uid);
    } catch {
      throw new NotFoundException('Usuário não encontrado');
    }
    const now = new Date();
    const newUser = {
      name: firebaseUser.displayName ?? '',
      email: firebaseUser.email ?? '',
      photoUrl: firebaseUser.photoURL ?? null,
      followersCount: 0,
      followingCount: 0,
      popularityScore: 0,
      favoriteRecipeIds: [] as string[],
      createdAt: now,
    };
    await this.db.collection('users').doc(uid).set(newUser);
    return this.authService.toUserResponse(newUser as User & { createdAt?: { toDate: () => Date } }, uid) as UserProfileResponseDto;
  }

  async updateProfile(uid: string, dto: AccountUpdateRequestDto): Promise<UserProfileResponseDto> {
    const ref = this.db.collection('users').doc(uid);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException('Usuário não encontrado');
    const data = doc.data() as Record<string, unknown>;
    if (this.userHasDeleted(data)) throw new NotFoundException('Conta excluída');

    const updates: Record<string, unknown> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.photoUrl !== undefined) updates.photoUrl = dto.photoUrl;
    if (Object.keys(updates).length === 0) {
      return this.getProfile(uid);
    }
    await ref.update(updates);
    return this.getProfile(uid);
  }

  async deleteAccount(uid: string): Promise<void> {
    const ref = this.db.collection('users').doc(uid);
    const doc = await ref.get();
    if (!doc.exists) return;
    await ref.update({ deletedAt: new Date() });
  }

  async follow(followerId: string, followingId: string): Promise<FollowResponseDto> {
    if (followerId === followingId) {
      throw new BadRequestException('Não é possível seguir a si mesmo');
    }
    const followingDoc = await this.db.collection('users').doc(followingId).get();
    if (!followingDoc.exists) throw new NotFoundException('Usuário não encontrado');
    const followingData = followingDoc.data() as Record<string, unknown>;
    if (this.userHasDeleted(followingData)) throw new NotFoundException('Usuário não encontrado');

    const existing = await this.db
      .collection('follows')
      .where('followerId', '==', followerId)
      .where('followingId', '==', followingId)
      .limit(1)
      .get();

    if (!existing.empty) {
      return { followerId, followingId, success: true };
    }

    const followRef = this.db.collection('follows').doc();
    await followRef.set({ followerId, followingId });

    const batch = this.db.batch();
    const followerRef = this.db.collection('users').doc(followerId);
    const followingRef = this.db.collection('users').doc(followingId);
    const followerDoc = await followerRef.get();
    const followingDoc2 = await followingRef.get();
    const followerCount = (followerDoc.data() as { followingCount?: number })?.followingCount ?? 0;
    const followingCount = (followingDoc2.data() as { followersCount?: number })?.followersCount ?? 0;
    batch.update(followerRef, { followingCount: followerCount + 1 });
    batch.update(followingRef, { followersCount: followingCount + 1 });
    await batch.commit();

    return { followerId, followingId, success: true };
  }

  /** Adiciona uma receita aos favoritos do usuário (array em users.favoriteRecipeIds). */
  async addFavorite(uid: string, recipeId: string): Promise<void> {
    const recipeDoc = await this.db.collection('recipes').doc(recipeId).get();
    if (!recipeDoc.exists) throw new NotFoundException('Receita não encontrada');
    const recipeData = recipeDoc.data() as { status?: string; authorId?: string };
    const status = recipeData.status ?? 'published';
    if (status === 'draft' && recipeData.authorId !== uid) {
      throw new NotFoundException('Receita não encontrada');
    }

    const userRef = this.db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new NotFoundException('Usuário não encontrado');
    const data = userDoc.data() as { favoriteRecipeIds?: string[]; deletedAt?: unknown };
    if (this.userHasDeleted(data)) throw new NotFoundException('Usuário não encontrado');

    const current = (data.favoriteRecipeIds ?? []).filter(Boolean);
    if (current.includes(recipeId)) return;
    const next = [...current, recipeId];
    await userRef.update({ favoriteRecipeIds: next });
  }

  /** Remove uma receita dos favoritos do usuário. */
  async removeFavorite(uid: string, recipeId: string): Promise<void> {
    const userRef = this.db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new NotFoundException('Usuário não encontrado');
    const data = userDoc.data() as { favoriteRecipeIds?: string[]; deletedAt?: unknown };
    if (this.userHasDeleted(data)) throw new NotFoundException('Usuário não encontrado');

    const current = (data.favoriteRecipeIds ?? []).filter(Boolean);
    const next = current.filter((id) => id !== recipeId);
    if (next.length === current.length) return;
    await userRef.update({ favoriteRecipeIds: next });
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    const followSnap = await this.db
      .collection('follows')
      .where('followerId', '==', followerId)
      .where('followingId', '==', followingId)
      .limit(1)
      .get();

    if (followSnap.empty) {
      throw new NotFoundException('Você não segue este usuário');
    }

    const batch = this.db.batch();
    batch.delete(followSnap.docs[0].ref);

    const followerRef = this.db.collection('users').doc(followerId);
    const followingRef = this.db.collection('users').doc(followingId);
    const followerDoc = await followerRef.get();
    const followingDoc2 = await followingRef.get();
    const followerCount = Math.max(0, ((followerDoc.data() as { followingCount?: number })?.followingCount ?? 1) - 1);
    const followingCount = Math.max(0, ((followingDoc2.data() as { followersCount?: number })?.followersCount ?? 1) - 1);
    batch.update(followerRef, { followingCount: followerCount });
    batch.update(followingRef, { followersCount: followingCount });
    await batch.commit();
  }

  /** Máximo de receitas lidas para agregação (cozinheiros recomendados) */
  private static readonly RECOMMENDED_COOKS_RECIPE_LIMIT = 2000;

  /** Lista cozinheiros recomendados para seguir: quem tem receitas publicadas, ordenado por quantidade de receitas (mais receitas primeiro). Opcional: filtrar por query (nome do cozinheiro ou nome do prato). */
  async getRecommendedCooks(
    requestUserId: string | undefined,
    options: { query?: string; limit?: number } = {},
  ): Promise<CookListResponseDto> {
    const limit = Math.min(options.limit ?? 20, 50);
    const queryLower = (options.query ?? '').trim().toLowerCase();

    const snapshot = await this.db
      .collection('recipes')
      .where('status', '==', 'published')
      .limit(SocialService.RECOMMENDED_COOKS_RECIPE_LIMIT)
      .get();

    const countByAuthor = new Map<string, number>();
    const authorIdsFromRecipeQuery = new Set<string>();
    for (const doc of snapshot.docs) {
      const data = doc.data() as { authorId?: string; titleLower?: string };
      const authorId = data.authorId ?? '';
      if (!authorId) continue;
      countByAuthor.set(authorId, (countByAuthor.get(authorId) ?? 0) + 1);
      if (queryLower && (data.titleLower ?? '').includes(queryLower)) {
        authorIdsFromRecipeQuery.add(authorId);
      }
    }

    let candidateAuthorIds: string[];
    if (queryLower) {
      const authorIdsFromName = new Set<string>();
      const authorIds = [...countByAuthor.keys()];
      const batchSize = 10;
      for (let i = 0; i < authorIds.length; i += batchSize) {
        const chunk = authorIds.slice(i, i + batchSize);
        const refs = chunk.map((id) => this.db.collection('users').doc(id));
        const usersSnap = await this.db.getAll(...refs);
        usersSnap.forEach((doc, idx) => {
          if (!doc.exists) return;
          const uid = chunk[idx];
          if (this.userHasDeleted(doc.data() as { deletedAt?: unknown })) return;
          const name = ((doc.data() as { name?: string }).name ?? '').toLowerCase();
          if (name.includes(queryLower)) authorIdsFromName.add(uid);
        });
      }
      candidateAuthorIds = [...new Set([...authorIdsFromRecipeQuery, ...authorIdsFromName])];
    } else {
      candidateAuthorIds = [...countByAuthor.keys()];
    }

    const sorted = candidateAuthorIds
      .map((authorId) => ({ authorId, count: countByAuthor.get(authorId) ?? 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    let followingSet = new Set<string>();
    if (requestUserId) {
      const followsSnap = await this.db
        .collection('follows')
        .where('followerId', '==', requestUserId)
        .get();
      followsSnap.docs.forEach((d) => {
        const followingId = (d.data() as { followingId?: string }).followingId;
        if (followingId) followingSet.add(followingId);
      });
    }

    const items: CookListItemDto[] = [];
    for (const { authorId, count } of sorted) {
      try {
        const profile = await this.getProfile(authorId);
        items.push({
          profile,
          recipesCount: count,
          isFollowing: requestUserId ? followingSet.has(authorId) : undefined,
        });
      } catch {
        // Usuário deletado ou não encontrado: omitir
      }
    }
    return { items };
  }
}
