import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CategoriesTagsService } from './categories-tags.service';
import { CategoryTagItemDto } from './dto/category-tag.dto';

@ApiTags('Tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly categoriesTagsService: CategoriesTagsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar tags (id + labels por idioma)' })
  @ApiResponse({ status: 200, description: 'Lista de tags', type: [CategoryTagItemDto] })
  async findAll(): Promise<CategoryTagItemDto[]> {
    return this.categoriesTagsService.getTags();
  }
}
