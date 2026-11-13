import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyPurchaseRequestDto {
  @ApiProperty({ enum: ['android', 'ios'] })
  @IsIn(['android', 'ios'])
  platform: 'android' | 'ios';

  @ApiProperty({ example: 'cooka_remove_ads', description: 'ID do produto na loja' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  productId: string;

  @ApiProperty({
    description:
      'Android: purchaseToken (verificationData.serverVerificationData). iOS: recibo/transação.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  purchaseToken: string;
}

export class VerifyPurchaseResponseDto {
  @ApiProperty()
  isAdsFree: boolean;
}
