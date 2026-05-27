import { Injectable, NotFoundException } from '@nestjs/common';
import { getFirestoreDb } from '../config/firebase.config';
import { toISOString } from '../common/utils/firestore.util';
import { AuthService } from '../auth/auth.service';
import { NotificationType, NotificationDto, NotificationListResponseDto } from './dto/notification.dto';
import type { User } from '../models/user.model';

const NOTIFICATIONS_COLLECTION = 'notifications';
const PUSH_TOKENS_COLLECTION = 'pushTokens';

@Injectable()
export class NotificationsService {
  constructor(private readonly authService: AuthService) {}

  private get db() {
    return getFirestoreDb();
  }

  async getNotifications(
    userId: string,
    limit: number,
    cursor?: string | null,
  ): Promise<NotificationListResponseDto> {
    let query = this.db
      .collection(NOTIFICATIONS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);

    if (cursor) {
      const cursorDoc = await this.db.collection(NOTIFICATIONS_COLLECTION).doc(cursor).get();
      if (cursorDoc.exists) {
        const createdAt = (cursorDoc.data() as { createdAt?: unknown })?.createdAt;
        query = query.startAfter(createdAt).limit(limit + 1);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, limit);
    const hasMore = snapshot.docs.length > limit;
    const nextCursor = hasMore && docs.length ? docs[docs.length - 1].id : null;

    const items: NotificationDto[] = [];
    for (const d of docs) {
      items.push(this.mapToDto(d));
    }

    const unreadCount = await this.getUnreadCount(userId);

    return { items, nextCursor, hasMore, unreadCount };
  }

  private async getUnreadCount(userId: string): Promise<number> {
    const snapshot = await this.db
      .collection(NOTIFICATIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('read', '==', false)
      .count()
      .get();
    return snapshot.data().count;
  }

  async markAsRead(userId: string, notificationId: string): Promise<NotificationDto> {
    const docRef = this.db.collection(NOTIFICATIONS_COLLECTION).doc(notificationId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Notificação não encontrada');
    }

    const data = doc.data() as { userId: string };
    if (data.userId !== userId) {
      throw new NotFoundException('Notificação não encontrada');
    }

    await docRef.update({ read: true });
    const updatedDoc = await docRef.get();
    return this.mapToDto(updatedDoc);
  }

  async markAllAsRead(userId: string): Promise<{ success: boolean; updatedCount: number }> {
    const snapshot = await this.db
      .collection(NOTIFICATIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('read', '==', false)
      .get();

    if (snapshot.empty) {
      return { success: true, updatedCount: 0 };
    }

    const batch = this.db.batch();
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { read: true });
    });
    await batch.commit();

    return { success: true, updatedCount: snapshot.size };
  }

  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    const docRef = this.db.collection(NOTIFICATIONS_COLLECTION).doc(notificationId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Notificação não encontrada');
    }

    const data = doc.data() as { userId: string };
    if (data.userId !== userId) {
      throw new NotFoundException('Notificação não encontrada');
    }

    await docRef.delete();
  }

  async savePushToken(userId: string, token: string, platform?: 'android' | 'ios' | 'web'): Promise<void> {
    const tokenHash = this.hashToken(token);

    const existing = await this.db
      .collection(PUSH_TOKENS_COLLECTION)
      .where('userId', '==', userId)
      .where('tokenHash', '==', tokenHash)
      .limit(1)
      .get();

    if (!existing.empty) {
      await existing.docs[0].ref.update({
        platform: platform ?? 'web',
        updatedAt: new Date(),
      });
      return;
    }

    const ref = this.db.collection(PUSH_TOKENS_COLLECTION).doc();
    await ref.set({
      userId,
      token,
      tokenHash,
      platform: platform ?? 'web',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async removePushToken(userId: string, token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const snapshot = await this.db
      .collection(PUSH_TOKENS_COLLECTION)
      .where('userId', '==', userId)
      .where('tokenHash', '==', tokenHash)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      await snapshot.docs[0].ref.delete();
    }
  }

  private hashToken(token: string): string {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: { recipeId?: string; userId?: string },
  ): Promise<NotificationDto> {
    const ref = this.db.collection(NOTIFICATIONS_COLLECTION).doc();
    await ref.set({
      userId,
      type,
      title,
      body,
      data: data ?? {},
      read: false,
      createdAt: new Date(),
    });

    const doc = await ref.get();
    return this.mapToDto(doc);
  }

  private mapToDto(doc: FirebaseFirestore.DocumentSnapshot): NotificationDto {
    const data = doc.data()!;
    return {
      id: doc.id,
      type: data.type,
      title: data.title,
      body: data.body,
      data: data.data,
      read: data.read ?? false,
      createdAt: toISOString(data.createdAt),
    };
  }
}
