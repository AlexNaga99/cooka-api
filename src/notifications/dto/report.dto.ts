import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ReportReason {
  SPAM = 'SPAM',
  HARASSMENT = 'HARASSMENT',
  INAPPROPRIATE = 'INAPPROPRIATE',
  VIOLENCE = 'VIOLENCE',
  COPYRIGHT = 'COPYRIGHT',
  OTHER = 'OTHER',
}

export class ReportRequestDto {
  @IsEnum(ReportReason)
  @ApiProperty({ enum: ReportReason, description: 'Motivo da denúncia' })
  reason: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional({ description: 'Descrição adicional (opcional)' })
  description?: string;
}

export class ReportResponseDto {
  @ApiProperty({ description: 'ID da denúncia' })
  id: string;

  @ApiProperty({ description: 'Tipo do alvo (recipe ou user)' })
  targetType: 'recipe' | 'user';

  @ApiProperty({ description: 'ID do alvo' })
  targetId: string;

  @ApiProperty({ enum: ReportReason, description: 'Motivo' })
  reason: ReportReason;

  @ApiPropertyOptional({ description: 'Descrição' })
  description?: string;

  @ApiProperty({ description: 'Reporter ID' })
  reporterId: string;

  @ApiProperty({ description: 'Data da denúncia' })
  createdAt: string;
}
