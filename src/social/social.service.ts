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
}
