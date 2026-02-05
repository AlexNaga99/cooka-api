import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SearchService } from './search.service';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { SearchResponseDto } from './dto/search.dto';
import { ErrorResponseDto } from '../common/dto/error.dto';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Buscar receitas e usuários' })
  @ApiQuery({ name: 'query', required: false, type: String, description: 'Parte do nome da receita (ou nome do usuário)' })
  @ApiQuery({ name: 'categoryIds', required: false, type: String, description: 'Ids de categorias separados por vírgula (ex.: dessert,main)' })
  @ApiQuery({ name: 'tagIds', required: false, type: String, description: 'Ids de tags separados por vírgula (ex.: vegan,chocolate)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiResponse({ status: 200, type: SearchResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async search(
    @Query('query') query: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('tagIds') tagIds?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<SearchResponseDto> {
    const limitNum = Math.min(parseInt(limit ?? '20', 10) || 20, 50);
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
    );
  }
}
