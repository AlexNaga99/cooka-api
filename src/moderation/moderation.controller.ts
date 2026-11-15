import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ADMIN_STATUSES, AdminStatus, ModerationService } from './moderation.service';
import { AdminGuard, checkAdminCredentials, signAdminToken } from './admin-auth';

class AdminLoginDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MaxLength(200)
  password!: string;
}

class RejectDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

/** Painel de moderação (site /admin). Login próprio por ADMIN_EMAIL/ADMIN_PASSWORD. */
@ApiExcludeController()
@Controller('admin')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  /** No máximo 5 tentativas por minuto por IP. */
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: AdminLoginDto) {
    if (!checkAdminCredentials(dto.email, dto.password)) {
      await new Promise((r) => setTimeout(r, 600)); // freia força bruta
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    return signAdminToken(dto.email);
  }

  @Get('moderation/queue')
  @UseGuards(AdminGuard)
  queue(@Query('status') status?: string) {
    const s = (status ?? 'review') as AdminStatus;
    if (!ADMIN_STATUSES.includes(s)) throw new BadRequestException('status inválido');
    return this.moderation.listForReview(s);
  }

  @Get('moderation/recipes/:id')
  @UseGuards(AdminGuard)
  detail(@Param('id') id: string) {
    return this.moderation.getForAdmin(id);
  }

  @Post('moderation/recipes/:id/approve')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  async approve(@Param('id') id: string) {
    await this.moderation.approve(id);
    return { success: true };
  }

  @Post('moderation/recipes/:id/reject')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  async reject(@Param('id') id: string, @Body() dto: RejectDto) {
    await this.moderation.reject(id, dto.reason);
    return { success: true };
  }
}
