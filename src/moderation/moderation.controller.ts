import { CanActivate, Controller, ExecutionContext, Get, Injectable, Param, Post, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { ModerationService } from './moderation.service';

/** Só uids listados em ADMIN_UIDS (separados por vírgula) acessam a moderação manual. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const uid = context.switchToHttp().getRequest<{ user?: { uid?: string } }>().user?.uid;
    const admins = (process.env.ADMIN_UIDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!uid || !admins.includes(uid)) throw new ForbiddenException('Acesso restrito');
    return true;
  }
}

@ApiExcludeController()
@ApiBearerAuth()
@Controller('admin/moderation')
@UseGuards(FirebaseAuthGuard, AdminGuard)
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('queue')
  queue() {
    return this.moderation.listForReview();
  }

  @Post('recipes/:id/approve')
  async approve(@Param('id') id: string) {
    await this.moderation.approve(id);
    return { success: true };
  }

  @Post('recipes/:id/reject')
  async reject(@Param('id') id: string) {
    await this.moderation.reject(id);
    return { success: true };
  }
}
