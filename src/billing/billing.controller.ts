import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/dto/error.dto';
import { BillingService } from './billing.service';
import { VerifyPurchaseRequestDto, VerifyPurchaseResponseDto } from './dto/verify-purchase.dto';

@ApiTags('Billing')
@Controller('account/ads-free')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Throttle({ short: { limit: 2, ttl: 1000 }, long: { limit: 20, ttl: 60_000 } })
  @Post('verify')
  @HttpCode(200)
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Validar compra "Remover anúncios" e liberar a conta',
    description:
      'Valida o purchaseToken no Google Play e marca isAdsFree=true na conta. ' +
      '503 (code=verification_unavailable) quando a validação não está disponível; o app pode tentar de novo depois.',
  })
  @ApiResponse({ status: 200, type: VerifyPurchaseResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: 'Compra inválida/pendente/de outra conta' })
  @ApiResponse({ status: 503, type: ErrorResponseDto, description: 'Validação indisponível' })
  async verify(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: VerifyPurchaseRequestDto,
  ): Promise<VerifyPurchaseResponseDto> {
    return this.billingService.verifyRemoveAds(user.uid, dto);
  }
}
