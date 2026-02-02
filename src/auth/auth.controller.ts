import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
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

  @Post('verify')
  @ApiOperation({ summary: 'Verificar token Firebase' })
  @ApiResponse({ status: 200, description: 'Token válido', type: AuthVerifyResponseDto })
  @ApiResponse({ status: 401, description: 'Token inválido', type: ErrorResponseDto })
  async verify(@Body() dto: AuthVerifyRequestDto): Promise<AuthVerifyResponseDto> {
    return this.authService.verifyToken(dto.idToken);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Renovar ID Token usando Refresh Token' })
  @ApiResponse({ status: 200, description: 'Novo ID Token e opcionalmente novo Refresh Token', type: AuthRefreshResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token inválido ou expirado', type: ErrorResponseDto })
  async refresh(@Body() dto: AuthRefreshRequestDto): Promise<AuthRefreshResponseDto> {
    return this.authService.refreshToken(dto.refreshToken);
  }
}
