import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Min, Max, IsString, IsNotEmpty, IsOptional } from 'class-validator';
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
  @ApiProperty({ description: 'Texto do comentário' })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiPropertyOptional({
    description: 'ID do comentário raiz quando for resposta',
    type: String,
  })
  @IsOptional()
  @IsString()
  parentId?: string;
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
  @ApiPropertyOptional({
    description: 'ID do comentário pai quando for resposta',
    type: String,
    nullable: true,
  })
  parentId?: string | null;
  @ApiPropertyOptional({
    description: 'Respostas ao comentário (só em comentário raiz)',
    type: () => CommentResponseDto,
    isArray: true,
  })
  replies?: CommentResponseDto[];
  @ApiPropertyOptional({
    description: 'Quantidade de respostas',
    type: Number,
  })
  repliesCount?: number;
}

export class CommentListResponseDto {
  @ApiProperty({ type: [CommentResponseDto] })
  items: CommentResponseDto[];
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Cursor para próxima página' })
  nextCursor?: string | null;
  @ApiProperty()
  hasMore: boolean;
}
