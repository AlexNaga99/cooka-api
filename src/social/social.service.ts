import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { getFirestoreDb, getFirebaseAuth } from '../config/firebase.config';
import { User } from '../models';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/dto/notification.dto';
import type {
  UserProfileResponseDto,
  FollowResponseDto,
  CookListResponseDto,
  CookListItemDto,
} from './dto/social.dto';
import type { AccountUpdateRequestDto } from './dto/account.dto';

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);
  constructor(
    private readonly authService: AuthService,
    private readonly notificationsService: NotificationsService,
  ) {}

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
    const displayName = firebaseUser.displayName ?? '';
    const newUser = {
      name: displayName,
      nameLower: displayName.toLowerCase(),
      email: firebaseUser.email ?? '',
      photoUrl: firebaseUser.photoURL ?? null,
      followersCount: 0,
      followingCount: 0,
      popularityScore: 0,
      recipesCount: 0,
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
    if (dto.name !== undefined) {
      updates.name = dto.name;
      updates.nameLower = dto.name.toLowerCase();
    }
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

    const followerProfile = await this.getProfile(followerId);
    this.notificationsService.createNotification(
      followingId,
      NotificationType.FOLLOW,
      'Novo seguidor',
      `${followerProfile.name} começou a te seguir`,
      { userId: followerId },
    ).catch((err) => this.logger.error('Erro ao criar notificação de follow', err));

    return { followerId, followingId, success: true };
  }

  /** Adiciona uma receita aos favoritos do usuário (array em users.favoriteRecipeIds). */
  async addFavorite(uid: string, recipeId: string): Promise<void> {
    const recipeDoc = await this.db.collection('recipes').doc(recipeId).get();
    if (!recipeDoc.exists) throw new NotFoundException('Receita não encontrada');
    const recipeData = recipeDoc.data() as { status?: string; authorId?: string; title?: string };
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

    const authorId = recipeData.authorId;
    if (authorId && authorId !== uid) {
      const favoriterProfile = await this.getProfile(uid);
      const recipeTitle = recipeData.title ?? 'sua receita';
      this.notificationsService.createNotification(
        authorId,
        NotificationType.FAVORITE,
        'Nova favorita',
        `${favoriterProfile.name} favoritou "${recipeTitle}"`,
        { recipeId },
      ).catch((err) => this.logger.error('Erro ao criar notificação de favorita', err));
    }
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

  /** Lista cozinheiros recomendados para seguir: quem tem receitas publicadas,
   *  ordenado por `recipesCount` desnormalizado no user (mais receitas primeiro).
   *  Opcional: filtrar por query (nome do cozinheiro ou nome do prato). */
  async getRecommendedCooks(
    requestUserId: string | undefined,
    options: { query?: string; limit?: number } = {},
  ): Promise<CookListResponseDto> {
    const limit = Math.min(options.limit ?? 20, 50);
    const queryLower = (options.query ?? '').trim().toLowerCase();

    // 1) Busca direta em users por prefix-match no nome (índice composto name asc + recipesCount desc).
    //    Quando não há query, basta ordenar por recipesCount desc.
    let candidates: { id: string; data: Record<string, unknown> }[] = [];

    if (queryLower) {
      // Procura por prefixo no nome (range query: >= q && < q).
      const nameSnap = await this.db
        .collection('users')
        .where('deletedAt', '==', null)
        .orderBy('nameLower')
        .startAt(queryLower)
        .endAt(queryLower + '')
        .limit(50)
        .get();
      for (const d of nameSnap.docs) {
        const data = d.data();
        if (this.userHasDeleted(data as { deletedAt?: unknown })) continue;
        candidates.push({ id: d.id, data });
      }

      // Se veio pouca coisa, completa com autores que têm receita com esse termo no título.
      if (candidates.length < limit) {
        const recipeSnap = await this.db
          .collection('recipes')
          .where('status', '==', 'published')
          .orderBy('titleLower')
          .startAt(queryLower)
          .endAt(queryLower + '')
          .limit(200)
          .get();
        const candidateIds = new Set(candidates.map((c) => c.id));
        const authorIdsToFetch: string[] = [];
        for (const d of recipeSnap.docs) {
          const authorId = (d.data() as { authorId?: string }).authorId;
          if (!authorId || candidateIds.has(authorId) || authorIdsToFetch.includes(authorId)) continue;
          authorIdsToFetch.push(authorId);
          if (authorIdsToFetch.length >= 30) break;
        }
        if (authorIdsToFetch.length > 0) {
          const refs = authorIdsToFetch.map((id) => this.db.collection('users').doc(id));
          const userDocs = await this.db.getAll(...refs);
          userDocs.forEach((udoc, idx) => {
            if (!udoc.exists) return;
            const data = udoc.data() ?? {};
            if (this.userHasDeleted(data as { deletedAt?: unknown })) return;
            candidates.push({ id: authorIdsToFetch[idx], data });
          });
        }
      }
    } else {
      // Sem filtro: top N usuários por recipesCount desc.
      const top = await this.db
        .collection('users')
        .where('deletedAt', '==', null)
        .orderBy('recipesCount', 'desc')
        .limit(limit)
        .get();
      for (const d of top.docs) {
        const data = d.data();
        candidates.push({ id: d.id, data });
      }
    }

    // Filtra quem tem 0 receitas e ordena por recipesCount desc.
    const withCount = candidates
      .map((c) => ({
        id: c.id,
        count: (c.data.recipesCount as number | undefined) ?? 0,
        data: c.data,
      }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    let followingSet = new Set<string>();
    if (requestUserId && withCount.length > 0) {
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
    for (const { id, count, data } of withCount) {
      const profile = this.authService.toUserResponse(
        data as unknown as import('../models').User & { createdAt?: { toDate: () => Date } },
        id,
      ) as UserProfileResponseDto;
      items.push({
        profile,
        recipesCount: count,
        isFollowing: requestUserId ? followingSet.has(id) : undefined,
      });
    }
    return { items };
  }
}
