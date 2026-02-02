import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SocialService } from './social.service';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../common/decorators/current-user.decorator';
import { UserProfileResponseDto, FollowResponseDto } from './dto/social.dto';
import { ErrorResponseDto } from '../common/dto/error.dto';

@ApiTags('Social')
@Controller()
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Get('users/:id/profile')
  @ApiOperation({ summary: 'Perfil do usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, type: UserProfileResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async getProfile(@Param('id') id: string): Promise<UserProfileResponseDto> {
    return this.socialService.getProfile(id);
  }

  @Post('follow/:userId')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Seguir usuário' })
  @ApiParam({ name: 'userId', description: 'ID do usuário a seguir' })
  @ApiResponse({ status: 200, type: FollowResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async follow(
    @Param('userId') userId: string,
    @CurrentUser() user: FirebaseUser,
  ): Promise<FollowResponseDto> {
    return this.socialService.follow(user.uid, userId);
  }
}
