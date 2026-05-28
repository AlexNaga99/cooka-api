import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { getFirestoreDb, getFirebaseMessaging } from '../config/firebase.config';
import { toISOString } from '../common/utils/firestore.util';
import { AuthService } from '../auth/auth.service';
import { NotificationType, NotificationDto, NotificationListResponseDto, SimulateNotificationDto, SimulateNotificationResponseDto } from './dto/notification.dto';
import type { User } from '../models/user.model';

const NOTIFICATIONS_COLLECTION = 'notifications';
const PUSH_TOKENS_COLLECTION = 'pushTokens';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

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
    if (!token || typeof token !== 'string' || !token.trim()) return;
    const tokenHash = this.hashToken(token.trim());
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
    return createHash('sha256').update(token).digest('hex').substring(0, 32);
  }

  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: { recipeId?: string; userId?: string },
  ): Promise<NotificationDto> {
    const ref = this.db.collection(NOTIFICATIONS_COLLECTION).doc();
    const docData: Record<string, unknown> = {
      userId,
      type,
      title,
      body,
      read: false,
      createdAt: new Date(),
    };

    if (data) {
      if (data.recipeId) docData.recipeId = data.recipeId;
      if (data.userId) docData.relatedUserId = data.userId;
    }

    await ref.set(docData);

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

  async getPushTokens(userId: string): Promise<Array<{ token: string; platform: string }>> {
    const snapshot = await this.db
      .collection(PUSH_TOKENS_COLLECTION)
      .where('userId', '==', userId)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return { token: data.token, platform: data.platform };
    });
  }

  async simulateNotification(dto: SimulateNotificationDto): Promise<SimulateNotificationResponseDto> {
    this.logger.log(`SimulateNotification: userId=${dto.userId}, type=${dto.type}`);
    this.logger.log(`FCM Token: ${dto.fcmToken}`);

    const result: SimulateNotificationResponseDto = {
      savedInDatabase: false,
      sentViaFcm: false,
      fcmTokensFound: 0,
    };

    const notification = await this.createNotification(
      dto.userId,
      dto.type,
      dto.title,
      dto.body,
      dto.data,
    );
    this.logger.log(`Notification created: ${notification.id}`);
    result.savedInDatabase = true;
    result.notificationId = notification.id;

    const targetToken = dto.fcmToken
      ? [{ token: dto.fcmToken, platform: 'android' }]
      : await this.getPushTokens(dto.userId);

    result.fcmTokensFound = targetToken.length;
    this.logger.log(`Tokens found: ${targetToken.length}`);

    if (targetToken.length === 0) {
      result.fcmError = 'Nenhum token FCM encontrado para o usuário';
      return result;
    }

    try {
      const messaging = getFirebaseMessaging();
      const token = targetToken[0].token;
      result.platform = targetToken[0].platform;

      this.logger.log(`Sending FCM message to token: ${token.substring(0, 30)}...`);

      const response = await messaging.send({
        token,
        notification: {
          title: dto.title,
          body: dto.body,
        },
        data: {
          notificationId: notification.id,
          type: dto.type,
          ...(dto.data?.recipeId ? { recipeId: dto.data.recipeId } : {}),
          ...(dto.data?.userId ? { userId: dto.data.userId } : {}),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'cooka_notifications',
            priority: 'high',
            icon: 'notification_icon',
            color: '#FF6B35',
          },
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
              mutableContent: true,
              alert: {
                title: dto.title,
                body: dto.body,
              },
            },
          },
          headers: {
            'apns-priority': '10',
            'apns-topic': 'cooka.notifications',
            'content-type': 'application/json; charset=utf-8',
          },
        },
      });

      this.logger.log(`FCM send success: ${response}`);
      result.sentViaFcm = true;
    } catch (error) {
      this.logger.error(`FCM send error: ${error instanceof Error ? error.message : error}`);
      result.fcmError = error instanceof Error ? error.message : 'Erro desconhecido ao enviar via FCM';
    }

    return result;
  }
}
