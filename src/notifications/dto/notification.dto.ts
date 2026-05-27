import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum NotificationType {
  FOLLOW = 'FOLLOW',
  COMMENT = 'COMMENT',
  RATING = 'RATING',
  FAVORITE = 'FAVORITE',
}

export class NotificationDataDto {
  @ApiPropertyOptional({ description: 'ID da receita relacionada' })
  recipeId?: string;

  @ApiPropertyOptional({ description: 'ID do usuário relacionado' })
  userId?: string;
}

export class NotificationDto {
  @ApiProperty({ description: 'ID da notificação' })
  id: string;

  @ApiProperty({ enum: NotificationType, description: 'Tipo da notificação' })
  type: NotificationType;

  @ApiProperty({ description: 'Título da notificação' })
  title: string;

  @ApiProperty({ description: 'Corpo da notificação' })
  body: string;

  @ApiPropertyOptional({ type: NotificationDataDto, description: 'Dados adicionais' })
  data?: NotificationDataDto;

  @ApiProperty({ description: 'Se foi lida' })
  read: boolean;

  @ApiProperty({ description: 'Data de criação em ISO8601' })
  createdAt: string;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationDto], description: 'Lista de notificações' })
  items: NotificationDto[];

  @ApiProperty({ description: 'Cursor para próxima página' })
  nextCursor: string | null;

  @ApiProperty({ description: 'Se existem mais notificações' })
  hasMore: boolean;

  @ApiProperty({ description: 'Total de notificações não lidas' })
  unreadCount: number;
}

export class PushTokenRequestDto {
  @ApiProperty({ description: 'Token FCM do dispositivo' })
  token: string;

  @ApiPropertyOptional({ description: 'Tipo do dispositivo (android, ios, web)' })
  platform?: 'android' | 'ios' | 'web';
}
