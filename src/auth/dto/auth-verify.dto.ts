import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AuthVerifyRequestDto {
  @ApiProperty({ description: 'Firebase ID Token' })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

export class UserResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  email: string;
  @ApiProperty({ nullable: true })
  photoUrl?: string | null;
  @ApiProperty()
  followersCount: number;
  @ApiProperty()
  followingCount: number;
  @ApiProperty()
  popularityScore: number;
  @ApiProperty()
  createdAt: string;
  @ApiProperty({ required: false, default: false })
  isAdsFree?: boolean;
}

export class AuthVerifyResponseDto {
  @ApiProperty({ description: 'Firebase UID' })
  uid: string;
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
  @ApiProperty({ description: 'ID Token (para guardar e usar no Authorization)', required: false })
  idToken?: string;
  @ApiProperty({ description: 'Refresh token (guardar e usar no POST /auth/refresh em 401)', required: false })
  refreshToken?: string;
  @ApiProperty({ description: 'Expiração do ID Token em segundos', required: false })
  expiresIn?: number;
}

export class AuthRefreshRequestDto {
  @ApiProperty({ description: 'Firebase Refresh Token' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class AuthRefreshResponseDto {
  @ApiProperty({ description: 'Novo ID Token (JWT)' })
  idToken: string;
  @ApiProperty({ description: 'Refresh Token (novo, se o Firebase rotacionar)', required: false })
  refreshToken?: string;
  @ApiProperty({ description: 'Expiração do ID Token em segundos' })
  expiresIn: number;
}
