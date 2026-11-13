import { markAccountDeleted } from '../common/utils/account-status';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
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

  async getProfile(userId: string, includePrivate = false): Promise<UserProfileResponseDto> {
    const doc = await this.db.collection('users').doc(userId).get();
    if (!doc.exists) throw new NotFoundException('Usuário não encontrado');
    const data = doc.data() as User & { createdAt?: { toDate: () => Date }; deletedAt?: unknown };
    if (this.userHasDeleted(data)) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return this.authService.toUserResponse(data, doc.id, includePrivate) as UserProfileResponseDto;
  }

  async getAccount(uid: string): Promise<UserProfileResponseDto> {
    const doc = await this.db.collection('users').doc(uid).get();
    if (doc.exists) {
      const data = doc.data() as User & { createdAt?: { toDate: () => Date }; deletedAt?: unknown };
      if (this.userHasDeleted(data)) {
        throw new NotFoundException('Conta excluída');
      }
      return this.authService.toUserResponse(data, doc.id, true) as UserProfileResponseDto;
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
      deletedAt: null,
    };
    await this.db.collection('users').doc(uid).set(newUser);
    return this.authService.toUserResponse(newUser as User & { createdAt?: { toDate: () => Date } }, uid, true) as UserProfileResponseDto;
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
      return this.getProfile(uid, true);
    }
    await ref.update(updates);
    return this.getProfile(uid, true);
  }

  /** Apaga todos os documentos de uma query, em lotes de 400. */
  private async deleteByQuery(query: FirebaseFirestore.Query): Promise<number> {
    let total = 0;
    for (;;) {
      const snap = await query.limit(400).get();
      if (snap.empty) break;
      const batch = this.db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      total += snap.size;
      if (snap.size < 400) break;
    }
    return total;
  }

  /**
   * Exclusão REAL da conta (exigência Google Play / App Store):
   * receitas (com comentários e avaliações delas), comentários e avaliações do usuário,
   * follows (ajustando contadores dos outros), bloqueios, notificações, tokens de sessão/push,
   * e o usuário no Firebase Auth. O documento users/{uid} fica anonimizado com deletedAt
   * (tombstone) para impedir que o getAccount recrie a conta em uso de token antigo.
   * Denúncias (reports) são mantidas como evidência de moderação.
   */
  async deleteAccount(uid: string): Promise<void> {
    const ref = this.db.collection('users').doc(uid);
    const doc = await ref.get();
    if (!doc.exists) return;

    // 1) Bloqueia imediatamente: a partir daqui os guards recusam o token.
    await ref.update({
      deletedAt: new Date(),
      name: 'Usuário removido',
      nameLower: '',
      email: '',
      photoUrl: null,
      favoriteRecipeIds: [],
      recipesCount: 0,
    });
    markAccountDeleted(uid);

    // 2) Receitas do usuário e tudo que depende delas.
    const recipes = await this.db.collection('recipes').where('authorId', '==', uid).get();
    for (const r of recipes.docs) {
      await this.deleteByQuery(this.db.collection('comments').where('recipeId', '==', r.id));
      await this.deleteByQuery(this.db.collection('ratings').where('recipeId', '==', r.id));
      await r.ref.delete();
    }

    // 3) Comentários e avaliações do usuário em receitas de outros.
    await this.deleteByQuery(this.db.collection('comments').where('authorId', '==', uid));
    const myRatings = await this.db.collection('ratings').where('userId', '==', uid).get();
    for (const rt of myRatings.docs) {
      const { recipeId, stars } = rt.data() as { recipeId: string; stars: number };
      const recipeRef = this.db.collection('recipes').doc(recipeId);
      await this.db.runTransaction(async (tx) => {
        const rec = await tx.get(recipeRef);
        if (!rec.exists) return;
        const d = rec.data() as { ratingSum?: number; ratingsCount?: number };
        const count = Math.max(0, (d.ratingsCount ?? 1) - 1);
        const sum = Math.max(0, (d.ratingSum ?? stars) - stars);
        tx.update(recipeRef, { ratingSum: sum, ratingsCount: count, ratingAvg: count > 0 ? sum / count : 0 });
      });
      await rt.ref.delete();
    }

    // 4) Follows nos dois sentidos, ajustando contadores dos outros usuários.
    const [following, followers] = await Promise.all([
      this.db.collection('follows').where('followerId', '==', uid).get(),
      this.db.collection('follows').where('followingId', '==', uid).get(),
    ]);
    for (const f of following.docs) {
      const { followingId } = f.data() as { followingId: string };
      await this.db.collection('users').doc(followingId)
        .update({ followersCount: FieldValue.increment(-1) }).catch(() => undefined);
      await f.ref.delete();
    }
    for (const f of followers.docs) {
      const { followerId } = f.data() as { followerId: string };
      await this.db.collection('users').doc(followerId)
        .update({ followingCount: FieldValue.increment(-1) }).catch(() => undefined);
      await f.ref.delete();
    }
    await ref.update({ followersCount: 0, followingCount: 0 });

    // 5) Bloqueios, notificações, sessões e push tokens.
    await Promise.all([
      this.deleteByQuery(this.db.collection('blocks').where('blockerId', '==', uid)),
      this.deleteByQuery(this.db.collection('blocks').where('blockedId', '==', uid)),
      this.deleteByQuery(this.db.collection('notifications').where('userId', '==', uid)),
      this.deleteByQuery(this.db.collection('refresh_tokens').where('uid', '==', uid)),
      this.deleteByQuery(this.db.collection('pushTokens').where('userId', '==', uid)),
    ]);

    // 6) Remove o login (Firebase Auth). Ignora se já não existir.
    try {
      await getFirebaseAuth().deleteUser(uid);
    } catch (err) {
      this.logger.warn(`deleteUser(${uid}) no Firebase Auth falhou: ${(err as Error).message}`);
    }
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
    const batch = this.db.batch();
    batch.set(followRef, { followerId, followingId });
    batch.update(this.db.collection('users').doc(followerId), { followingCount: FieldValue.increment(1) });
    batch.update(this.db.collection('users').doc(followingId), { followersCount: FieldValue.increment(1) });
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
    if (current.length >= 2000) throw new BadRequestException('Limite de favoritos atingido');
    await userRef.update({ favoriteRecipeIds: FieldValue.arrayUnion(recipeId) });

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
    if (!current.includes(recipeId)) return;
    await userRef.update({ favoriteRecipeIds: FieldValue.arrayRemove(recipeId) });
  }

  /** Bloqueia um usuário: remove vínculos de follow e oculta seus comentários. */
  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw new BadRequestException('Não é possível bloquear a si mesmo');
    const target = await this.db.collection('users').doc(blockedId).get();
    if (!target.exists) throw new NotFoundException('Usuário não encontrado');
    await this.db
      .collection('blocks')
      .doc(`${blockerId}_${blockedId}`)
      .set({ blockerId, blockedId, createdAt: new Date() });
    // Encerra follows nos dois sentidos (best effort).
    await this.unfollow(blockerId, blockedId).catch(() => undefined);
    await this.unfollow(blockedId, blockerId).catch(() => undefined);
  }

  /** Perfis públicos dos usuários que o requester bloqueou. */
  async getBlockedUsers(blockerId: string): Promise<{ items: UserProfileResponseDto[] }> {
    const snap = await this.db.collection('blocks').where('blockerId', '==', blockerId).get();
    const ids = snap.docs.map((d) => (d.data() as { blockedId: string }).blockedId).slice(0, 200);
    if (ids.length === 0) return { items: [] };
    const docs = await this.db.getAll(...ids.map((id) => this.db.collection('users').doc(id)));
    const items = docs
      .filter((d) => d.exists)
      .map((d) =>
        this.authService.toUserResponse(
          d.data() as User & { createdAt?: { toDate: () => Date } },
          d.id,
        ) as UserProfileResponseDto,
      );
    return { items };
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await this.db.collection('blocks').doc(`${blockerId}_${blockedId}`).delete();
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

    batch.update(this.db.collection('users').doc(followerId), { followingCount: FieldValue.increment(-1) });
    batch.update(this.db.collection('users').doc(followingId), { followersCount: FieldValue.increment(-1) });
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
