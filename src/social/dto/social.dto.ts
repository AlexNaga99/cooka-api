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
