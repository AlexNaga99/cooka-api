import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserResponseDto } from '../../auth/dto/auth-verify.dto';

export class UserProfileResponseDto extends UserResponseDto {}

export class FollowResponseDto {
  @ApiProperty()
  followerId: string;
  @ApiProperty()
  followingId: string;
  @ApiProperty()
  success: boolean;
}

/** Item da listagem de cozinheiros (recomendados ou busca por nome/prato) */
export class CookListItemDto {
  @ApiProperty({ type: UserProfileResponseDto, description: 'Perfil do cozinheiro' })
  profile: UserProfileResponseDto;
  @ApiProperty({ description: 'Quantidade de receitas publicadas' })
  recipesCount: number;
  @ApiProperty({ description: 'Se o usuário logado segue este cozinheiro', required: false })
  isFollowing?: boolean;
}

export class CookListResponseDto {
  @ApiProperty({ type: [CookListItemDto] })
  items: CookListItemDto[];
}
