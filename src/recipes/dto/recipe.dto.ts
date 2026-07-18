import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsOptional,
  IsUrl,
  IsIn,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { UserResponseDto } from '../../auth/dto/auth-verify.dto';

// Limites razoáveis para uma rede social de receitas.
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 5000;
const INGREDIENTS_MAX = 5000;
const STEPS_MAX = 10_000;
const URL_MAX = 2048;
const CATEGORIES_MAX = 5;
const TAGS_MAX = 15;

export class RecipeCreateRequestDto {
  @ApiProperty()
  @IsString()
  @MaxLength(TITLE_MAX)
  title: string;
  @ApiPropertyOptional({
    description: '(opcional) Mantido para compatibilidade; preferir ingredients + preparationSteps',
  })
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX)
  description?: string;
  @ApiPropertyOptional({
    description: 'Texto dos ingredientes (formato livre)',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(INGREDIENTS_MAX)
  ingredients?: string | null;
  @ApiPropertyOptional({
    description: 'Modo de preparo / passo a passo (formato livre)',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(STEPS_MAX)
  preparationSteps?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  @MaxLength(URL_MAX, { each: true })
  mediaUrls?: string[];
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  videoUrl?: string | null;
  @ApiPropertyOptional({
    type: [String],
    description: 'Ids de categorias retornados por GET /api/categories',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CATEGORIES_MAX)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  categories?: string[];
  @ApiPropertyOptional({
    type: [String],
    description: 'Ids de tags retornados por GET /api/tags',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TAGS_MAX)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];
  @ApiPropertyOptional({ enum: ['published', 'draft'], default: 'published' })
  @IsOptional()
  @IsIn(['published', 'draft'])
  status?: 'published' | 'draft';
}

export class RecipeUpdateRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(TITLE_MAX)
  title?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX)
  description?: string;
  @ApiPropertyOptional({
    description: 'Texto dos ingredientes (formato livre)',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(INGREDIENTS_MAX)
  ingredients?: string | null;
  @ApiPropertyOptional({
    description: 'Modo de preparo / passo a passo (formato livre)',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(STEPS_MAX)
  preparationSteps?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  @MaxLength(URL_MAX, { each: true })
  mediaUrls?: string[];
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  videoUrl?: string | null;
  @ApiPropertyOptional({
    type: [String],
    description: 'Ids de categorias retornados por GET /api/categories',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CATEGORIES_MAX)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  categories?: string[];
  @ApiPropertyOptional({
    type: [String],
    description: 'Ids de tags retornados por GET /api/tags',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TAGS_MAX)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];
  @ApiPropertyOptional({ enum: ['published', 'draft'] })
  @IsOptional()
  @IsIn(['published', 'draft'])
  status?: 'published' | 'draft';
}

export class RecipeVariationRequestDto extends RecipeCreateRequestDto {}

export class RecipeResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  authorId: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  description: string;
  @ApiPropertyOptional({
    description: 'Texto dos ingredientes (formato livre)',
    nullable: true,
  })
  ingredients?: string | null;
  @ApiPropertyOptional({
    description: 'Modo de preparo / passo a passo (formato livre)',
    nullable: true,
  })
  preparationSteps?: string | null;
  @ApiProperty({ type: [String] })
  mediaUrls: string[];
  @ApiPropertyOptional({ nullable: true })
  videoUrl?: string | null;
  @ApiProperty({ type: [String] })
  categories: string[];
  @ApiProperty({ type: [String] })
  tags: string[];
  @ApiProperty({ default: false })
  isVariation: boolean;
  @ApiPropertyOptional({ nullable: true })
  parentRecipeId?: string | null;
  @ApiProperty()
  ratingAvg: number;
  @ApiProperty()
  ratingsCount: number;
  @ApiPropertyOptional({ description: 'Soma das estrelas (desnormalizado para O(1) no rate)' })
  ratingSum?: number;
  @ApiPropertyOptional({
    description: 'Estrelas (1–5) da avaliação do usuário logado nesta receita; só presente quando autenticado',
    nullable: true,
  })
  myRating?: number | null;
  @ApiPropertyOptional({ enum: ['published', 'draft'], default: 'published' })
  status?: 'published' | 'draft';
  @ApiProperty()
  createdAt: string;
  @ApiPropertyOptional({ type: () => UserResponseDto })
  author?: UserResponseDto;
}

export class RecipeFeedResponseDto {
  @ApiProperty({ type: [RecipeResponseDto] })
  items: RecipeResponseDto[];
  @ApiPropertyOptional({ nullable: true })
  nextCursor?: string | null;
  @ApiProperty()
  hasMore: boolean;
}
