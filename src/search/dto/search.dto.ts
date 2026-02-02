import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecipeResponseDto } from '../../recipes/dto/recipe.dto';
import { UserProfileResponseDto } from '../../social/dto/social.dto';

export class SearchResponseDto {
  @ApiProperty({ type: [RecipeResponseDto] })
  recipes: RecipeResponseDto[];
  @ApiProperty({ type: [UserProfileResponseDto] })
  users: UserProfileResponseDto[];
  @ApiPropertyOptional({ nullable: true })
  nextCursor?: string | null;
  @ApiProperty()
  hasMore: boolean;
}
