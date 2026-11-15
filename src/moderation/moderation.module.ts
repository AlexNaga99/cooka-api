import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ModerationController, AdminGuard } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { VisionService } from './vision.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ModerationController],
  providers: [ModerationService, VisionService, AdminGuard],
  exports: [ModerationService],
})
export class ModerationModule {}
