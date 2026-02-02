import {
  Body,
  Controller,
  Get,
  Param,
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
import { CurrentUser, FirebaseUser } from '../common/decorators/current-user.decorator';
import {
  RecipeCreateRequestDto,
  RecipeVariationRequestDto,
  RecipeResponseDto,
  RecipeFeedResponseDto,
} from './dto/recipe.dto';
import { RateRequestDto, RateResponseDto, CommentRequestDto, CommentResponseDto } from './dto/rate-comment.dto';
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

  @Get(':id')
  @ApiOperation({ summary: 'Obter receita por ID' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: RecipeResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async getById(@Param('id') id: string): Promise<RecipeResponseDto> {
    return this.recipesService.getById(id);
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

  @Post(':id/rate')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Avaliar receita (1–5 estrelas)' })
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
  @ApiOperation({ summary: 'Comentar receita' })
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
    return this.ratingsService.comment(id, user.uid, dto.text);
  }
}
