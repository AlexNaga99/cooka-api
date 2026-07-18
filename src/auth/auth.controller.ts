import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  AuthVerifyRequestDto,
  AuthVerifyResponseDto,
  AuthRefreshRequestDto,
  AuthRefreshResponseDto,
} from './dto/auth-verify.dto';
import { ErrorResponseDto } from '../common/dto/error.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Auth é alvo de brute-force: limite mais agressivo (60/min = 1 rps médio).
  @Throttle({ short: { limit: 5, ttl: 1000 }, long: { limit: 60, ttl: 60_000 } })
  @Post('verify')
  @ApiOperation({ summary: 'Verificar token Firebase' })
  @ApiResponse({ status: 200, description: 'Token válido', type: AuthVerifyResponseDto })
  @ApiResponse({ status: 401, description: 'Token inválido', type: ErrorResponseDto })
  async verify(@Body() dto: AuthVerifyRequestDto): Promise<AuthVerifyResponseDto> {
    return this.authService.verifyToken(dto.idToken);
  }

  @Throttle({ short: { limit: 5, ttl: 1000 }, long: { limit: 60, ttl: 60_000 } })
  @Post('refresh')
  @ApiOperation({ summary: 'Renovar ID Token usando Refresh Token' })
  @ApiResponse({ status: 200, description: 'Novo ID Token e opcionalmente novo Refresh Token', type: AuthRefreshResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token inválido ou expirado', type: ErrorResponseDto })
  async refresh(@Body() dto: AuthRefreshRequestDto): Promise<AuthRefreshResponseDto> {
    return this.authService.refreshToken(dto.refreshToken);
  }
}
