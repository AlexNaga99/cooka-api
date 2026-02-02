import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { getFirestoreDb } from '../config/firebase.config';
import { User } from '../models';
import { AuthService } from '../auth/auth.service';
import type { UserProfileResponseDto, FollowResponseDto } from './dto/social.dto';

@Injectable()
export class SocialService {
  constructor(private readonly authService: AuthService) {}

  private get db() {
    return getFirestoreDb();
  }

  async getProfile(userId: string): Promise<UserProfileResponseDto> {
    const doc = await this.db.collection('users').doc(userId).get();
    if (!doc.exists) throw new NotFoundException('Usuário não encontrado');
    const data = doc.data() as User & { createdAt?: { toDate: () => Date } };
    return this.authService.toUserResponse(data, doc.id) as UserProfileResponseDto;
  }

  async follow(followerId: string, followingId: string): Promise<FollowResponseDto> {
    if (followerId === followingId) {
      throw new BadRequestException('Não é possível seguir a si mesmo');
    }
    const followingDoc = await this.db.collection('users').doc(followingId).get();
    if (!followingDoc.exists) throw new NotFoundException('Usuário não encontrado');

    const existing = await this.db
      .collection('follows')
      .where('followerId', '==', followerId)
      .where('followingId', '==', followingId)
      .limit(1)
      .get();

    if (!existing.empty) {
      return { followerId, followingId, success: true };
    }

    const ref = this.db.collection('follows').doc();
    await ref.set({ followerId, followingId });

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
}
