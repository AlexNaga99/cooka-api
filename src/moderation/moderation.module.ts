import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ModerationController } from './moderation.controller';
import { AdminGuard } from './admin-auth';
import { ModerationService } from './moderation.service';
import { VisionService } from './vision.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ModerationController],
  providers: [ModerationService, VisionService, AdminGuard],
  exports: [ModerationService, VisionService],
})
export class ModerationModule {}
