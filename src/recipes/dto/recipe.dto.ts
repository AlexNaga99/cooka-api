import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsUrl, IsIn } from 'class-validator';
import { UserResponseDto } from '../../auth/dto/auth-verify.dto';

export class RecipeCreateRequestDto {
  @ApiProperty()
  @IsString()
  title: string;
  @ApiProperty()
  @IsString()
  description: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  mediaUrls?: string[];
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl()
  videoUrl?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
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
  title?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  mediaUrls?: string[];
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl()
  videoUrl?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
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
