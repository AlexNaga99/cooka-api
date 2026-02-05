import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CategoriesTagsService } from './categories-tags.service';
import { CategoryTagItemDto } from './dto/category-tag.dto';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesTagsService: CategoriesTagsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar categorias (id + labels por idioma)' })
  @ApiResponse({ status: 200, description: 'Lista de categorias', type: [CategoryTagItemDto] })
  async findAll(): Promise<CategoryTagItemDto[]> {
    return this.categoriesTagsService.getCategories();
  }
}
