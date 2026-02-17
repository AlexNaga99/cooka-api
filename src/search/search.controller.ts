import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SearchService } from './search.service';
import { OptionalFirebaseAuthGuard } from '../common/guards/optional-firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../common/decorators/current-user.decorator';
import { SearchResponseDto } from './dto/search.dto';
import { ErrorResponseDto } from '../common/dto/error.dto';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @UseGuards(OptionalFirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Buscar receitas e usuários (filtros: nome, categoria, tags)',
    description:
      'Sem filtros: retorna os primeiros 30 recomendados (por popularidade/favoritagem, depois pelas mais recentes). Com filtros: busca por query, categoryIds e/ou tagIds.',
  })
  @ApiQuery({ name: 'query', required: false, type: String, description: 'Parte do nome da receita ou do usuário' })
  @ApiQuery({ name: 'categoryIds', required: false, type: String, description: 'Ids de categorias separados por vírgula (ex.: dessert,main)' })
  @ApiQuery({ name: 'tagIds', required: false, type: String, description: 'Ids de tags separados por vírgula (ex.: vegan,chocolate)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Máximo de receitas (default 20; sem filtros usa até 30 recomendados)' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiResponse({ status: 200, type: SearchResponseDto })
  async search(
    @Query('query') query: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('tagIds') tagIds?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser() user?: FirebaseUser,
  ): Promise<SearchResponseDto> {
    const hasFilters =
      (query?.trim()?.length ?? 0) > 0 ||
      (categoryIds?.trim()?.length ?? 0) > 0 ||
      (tagIds?.trim()?.length ?? 0) > 0;
    const defaultLimit = hasFilters ? 20 : 30;
    const limitNum = Math.min(parseInt(limit ?? String(defaultLimit), 10) || defaultLimit, 50);
    const categoryIdsArr = categoryIds
      ? categoryIds.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30)
      : undefined;
    const tagIdsArr = tagIds
      ? tagIds.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30)
      : undefined;
    return this.searchService.search(
      query ?? '',
      limitNum,
      cursor ?? null,
      categoryIdsArr,
      tagIdsArr,
      user?.uid,
    );
  }
}
