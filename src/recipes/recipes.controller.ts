import {
  Body,
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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { RecipesService } from './recipes.service';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { OptionalFirebaseAuthGuard } from '../common/guards/optional-firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../common/decorators/current-user.decorator';
import {
  RecipeCreateRequestDto,
  RecipeVariationRequestDto,
  RecipeUpdateRequestDto,
  RecipeResponseDto,
  RecipeFeedResponseDto,
} from './dto/recipe.dto';
import {
  RateRequestDto,
  RateResponseDto,
  MyRatingResponseDto,
  CommentRequestDto,
  CommentResponseDto,
  CommentListResponseDto,
} from './dto/rate-comment.dto';
import { ErrorResponseDto } from '../common/dto/error.dto';
import { RatingsService } from './ratings.service';

@ApiTags('Recipes')
@Controller('recipes')
export class RecipesController {
  constructor(
    private readonly recipesService: RecipesService,
    private readonly ratingsService: RatingsService,
  ) {}

  @Post()
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar receita' })
  @ApiResponse({ status: 201, description: 'Receita criada', type: RecipeResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async create(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: RecipeCreateRequestDto,
  ): Promise<RecipeResponseDto> {
    return this.recipesService.create(user.uid, dto);
  }

  @Get('feed')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Feed de receitas' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiResponse({ status: 200, type: RecipeFeedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async feed(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<RecipeFeedResponseDto> {
    const limitNum = Math.min(
      parseInt(limit ?? '20', 10) || 20,
      50,
    );
    return this.recipesService.getFeed(limitNum, cursor ?? null);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Listar comentários da receita' })
  @ApiParam({ name: 'id' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiResponse({ status: 200, type: CommentListResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async getComments(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<CommentListResponseDto> {
    const limitNum = Math.min(parseInt(limit ?? '20', 10) || 20, 50);
    return this.ratingsService.getComments(id, limitNum, cursor ?? null);
  }

  @Get(':id')
  @UseGuards(OptionalFirebaseAuthGuard)
  @ApiOperation({ summary: 'Obter receita por ID (autor vê rascunho)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: RecipeResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async getById(
    @Param('id') id: string,
    @CurrentUser() user?: FirebaseUser,
  ): Promise<RecipeResponseDto> {
    return this.recipesService.getById(id, user?.uid);
  }

  @Patch(':id')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar receita (só autor)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: RecipeResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: FirebaseUser,
    @Body() dto: RecipeUpdateRequestDto,
  ): Promise<RecipeResponseDto> {
    return this.recipesService.update(id, user.uid, dto);
  }

  @Delete(':id')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir receita (só autor)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 204, description: 'Receita excluída' })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: FirebaseUser,
  ): Promise<void> {
    await this.recipesService.delete(id, user.uid);
  }

  @Post(':id')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar variação da receita' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 201, type: RecipeResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async createVariation(
    @Param('id') id: string,
    @CurrentUser() user: FirebaseUser,
    @Body() dto: RecipeVariationRequestDto,
  ): Promise<RecipeResponseDto> {
    return this.recipesService.createVariation(id, user.uid, dto);
  }

  @Get(':id/rate')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ver se já avaliei esta receita e qual nota' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: MyRatingResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async getMyRating(
    @Param('id') id: string,
    @CurrentUser() user: FirebaseUser,
  ): Promise<MyRatingResponseDto> {
    const rating = await this.ratingsService.getMyRating(id, user.uid);
    return rating ? { rated: true, stars: rating.stars } : { rated: false };
  }

  @Post(':id/rate')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Avaliar ou atualizar avaliação (1–5 estrelas). Uma avaliação por usuário por receita.',
  })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: RateResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async rate(
    @Param('id') id: string,
    @CurrentUser() user: FirebaseUser,
    @Body() dto: RateRequestDto,
  ): Promise<RateResponseDto> {
    return this.ratingsService.rate(id, user.uid, dto.stars);
  }

  @Post(':id/comment')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Comentar receita ou responder comentário' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 201, type: CommentResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async comment(
    @Param('id') id: string,
    @CurrentUser() user: FirebaseUser,
    @Body() dto: CommentRequestDto,
  ): Promise<CommentResponseDto> {
    return this.ratingsService.comment(id, user.uid, dto.text, dto.parentId ?? null);
  }
}
