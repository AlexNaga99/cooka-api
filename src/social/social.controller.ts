import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { SocialService } from './social.service';
import { RecipesService } from '../recipes/recipes.service';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { OptionalFirebaseAuthGuard } from '../common/guards/optional-firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../common/decorators/current-user.decorator';
import { UserProfileResponseDto, FollowResponseDto } from './dto/social.dto';
import { AccountUpdateRequestDto } from './dto/account.dto';
import { RecipeFeedResponseDto } from '../recipes/dto/recipe.dto';
import { ErrorResponseDto } from '../common/dto/error.dto';

@ApiTags('Social')
@Controller()
export class SocialController {
  constructor(
    private readonly socialService: SocialService,
    private readonly recipesService: RecipesService,
  ) {}

  @Get('account')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil do usuário logado' })
  @ApiResponse({ status: 200, type: UserProfileResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async getAccount(@CurrentUser() user: FirebaseUser): Promise<UserProfileResponseDto> {
    return this.socialService.getAccount(user.uid);
  }

  @Patch('account')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar perfil (nome, foto)' })
  @ApiResponse({ status: 200, type: UserProfileResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async updateAccount(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: AccountUpdateRequestDto,
  ): Promise<UserProfileResponseDto> {
    return this.socialService.updateProfile(user.uid, dto);
  }

  @Delete('account')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir conta (soft-delete / LGPD)' })
  @ApiResponse({ status: 204, description: 'Conta excluída' })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async deleteAccount(@CurrentUser() user: FirebaseUser): Promise<void> {
    await this.socialService.deleteAccount(user.uid);
  }

  @Get('account/recipes')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Minhas receitas (com opção status=draft)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['published', 'draft'], description: 'Filtrar por status' })
  @ApiResponse({ status: 200, type: RecipeFeedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async getMyRecipes(
    @CurrentUser() user: FirebaseUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('status') status?: 'published' | 'draft',
  ): Promise<RecipeFeedResponseDto> {
    const limitNum = Math.min(parseInt(limit ?? '20', 10) || 20, 50);
    return this.recipesService.getByAuthorId(user.uid, user.uid, limitNum, cursor ?? null, status ?? undefined);
  }

  @Get('users/:id/profile')
  @ApiOperation({ summary: 'Perfil do usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, type: UserProfileResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async getProfile(@Param('id') id: string): Promise<UserProfileResponseDto> {
    return this.socialService.getProfile(id);
  }

  @Get('users/:id/recipes')
  @UseGuards(OptionalFirebaseAuthGuard)
  @ApiOperation({ summary: 'Receitas publicadas do usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['published', 'draft'], description: 'Só autor pode usar draft' })
  @ApiResponse({ status: 200, type: RecipeFeedResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async getUserRecipes(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('status') status?: 'published' | 'draft',
    @CurrentUser() user?: FirebaseUser,
  ): Promise<RecipeFeedResponseDto> {
    const limitNum = Math.min(parseInt(limit ?? '20', 10) || 20, 50);
    const requestUserId = user?.uid;
    return this.recipesService.getByAuthorId(id, requestUserId, limitNum, cursor ?? null, status ?? undefined);
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

  @Delete('follow/:userId')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deixar de seguir (unfollow)' })
  @ApiParam({ name: 'userId', description: 'ID do usuário' })
  @ApiResponse({ status: 204, description: 'Unfollow realizado' })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async unfollow(
    @Param('userId') userId: string,
    @CurrentUser() user: FirebaseUser,
  ): Promise<void> {
    await this.socialService.unfollow(user.uid, userId);
  }
}
