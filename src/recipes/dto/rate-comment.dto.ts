import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Min, Max, IsString, IsNotEmpty } from 'class-validator';
import { UserResponseDto } from '../../auth/dto/auth-verify.dto';

export class RateRequestDto {
  @ApiProperty({ minimum: 1, maximum: 5, description: 'Estrelas de 1 a 5' })
  @IsInt()
  @Min(1)
  @Max(5)
  stars: number;
}

export class RateResponseDto {
  @ApiProperty()
  recipeId: string;
  @ApiProperty()
  userId: string;
  @ApiProperty()
  stars: number;
  @ApiProperty()
  ratingAvg: number;
  @ApiProperty()
  ratingsCount: number;
}

export class CommentRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;
}

export class CommentResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  recipeId: string;
  @ApiProperty()
  authorId: string;
  @ApiProperty()
  text: string;
  @ApiProperty()
  createdAt: string;
  @ApiPropertyOptional({ type: () => UserResponseDto })
  author?: UserResponseDto;
}
