import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsString,
  IsOptional,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const COOKING_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const COOKING_TIMES = ['quick', 'medium', 'relaxed'] as const;
export const COOKING_GOALS = ['discover', 'save', 'publish', 'both'] as const;

/** Respostas do onboarding (personalização da conta). */
export class AccountPreferencesDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'IDs de categorias de interesse (GET /api/categories)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  @Matches(/^[a-z0-9-]+$/, { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ enum: COOKING_LEVELS })
  @IsOptional()
  @IsIn(COOKING_LEVELS)
  cookingLevel?: (typeof COOKING_LEVELS)[number];

  @ApiPropertyOptional({ enum: COOKING_TIMES })
  @IsOptional()
  @IsIn(COOKING_TIMES)
  cookingTime?: (typeof COOKING_TIMES)[number];

  @ApiPropertyOptional({ enum: COOKING_GOALS })
  @IsOptional()
  @IsIn(COOKING_GOALS)
  goal?: (typeof COOKING_GOALS)[number];
}

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

  @ApiPropertyOptional({
    type: AccountPreferencesDto,
    description: 'Preferências do onboarding (interesses, nível, tempo, objetivo)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AccountPreferencesDto)
  preferences?: AccountPreferencesDto;
}
