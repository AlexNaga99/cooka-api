import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../common/decorators/current-user.decorator';
import {
  NotificationDto,
  NotificationListResponseDto,
  PushTokenRequestDto,
} from './dto/notification.dto';
import { ErrorResponseDto } from '../common/dto/error.dto';

@ApiTags('Notifications')
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('notifications')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar notificações do usuário (paginado)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Limite de notificações (default 20, máx 50)' })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Cursor para paginação' })
  @ApiResponse({ status: 200, type: NotificationListResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async getNotifications(
    @CurrentUser() user: FirebaseUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<NotificationListResponseDto> {
    const limitNum = Math.min(parseInt(limit ?? '20', 10) || 20, 50);
    return this.notificationsService.getNotifications(user.uid, limitNum, cursor ?? null);
  }

  @Patch('notifications/:id/read')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar notificação como lida' })
  @ApiParam({ name: 'id', description: 'ID da notificação' })
  @ApiResponse({ status: 200, type: NotificationDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: FirebaseUser,
  ): Promise<NotificationDto> {
    return this.notificationsService.markAsRead(user.uid, id);
  }

  @Patch('notifications/read-all')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar todas as notificações como lidas' })
  @ApiResponse({ status: 200, schema: { properties: { success: { type: 'boolean' }, updatedCount: { type: 'number' } } } })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async markAllAsRead(@CurrentUser() user: FirebaseUser): Promise<{ success: boolean; updatedCount: number }> {
    return this.notificationsService.markAllAsRead(user.uid);
  }

  @Delete('notifications/:id')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar notificação' })
  @ApiParam({ name: 'id', description: 'ID da notificação' })
  @ApiResponse({ status: 204, description: 'Notificação deletada' })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async deleteNotification(
    @Param('id') id: string,
    @CurrentUser() user: FirebaseUser,
  ): Promise<void> {
    await this.notificationsService.deleteNotification(user.uid, id);
  }

  @Post('users/push-token')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar token FCM do usuário' })
  @ApiResponse({ status: 200, schema: { properties: { success: { type: 'boolean' } } } })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async registerPushToken(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: PushTokenRequestDto,
  ): Promise<{ success: boolean }> {
    await this.notificationsService.savePushToken(user.uid, dto.token, dto.platform);
    return { success: true };
  }

  @Delete('users/push-token')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover token FCM do usuário' })
  @ApiResponse({ status: 204, description: 'Token removido' })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async removePushToken(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: PushTokenRequestDto,
  ): Promise<void> {
    await this.notificationsService.removePushToken(user.uid, dto.token);
  }
}
