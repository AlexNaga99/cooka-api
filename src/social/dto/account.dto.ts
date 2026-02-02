import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, MaxLength } from 'class-validator';

export class AccountUpdateRequestDto {
  @ApiPropertyOptional({ description: 'Nome do usuário' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'URL da foto de perfil', nullable: true })
  @IsOptional()
  @IsUrl()
  photoUrl?: string | null;
}
