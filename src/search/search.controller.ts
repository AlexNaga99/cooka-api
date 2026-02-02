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
  @ApiQuery({ name: 'query', required: true, type: String })
  @ApiQuery({ name: 'filters', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiResponse({ status: 200, type: SearchResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async search(
    @Query('query') query: string,
    @Query('filters') filters?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<SearchResponseDto> {
    const limitNum = Math.min(parseInt(limit ?? '20', 10) || 20, 50);
    return this.searchService.search(query ?? '', filters, limitNum, cursor ?? null);
  }
}
