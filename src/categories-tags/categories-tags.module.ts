import { Module } from '@nestjs/common';
import { CategoriesTagsService } from './categories-tags.service';
import { CategoriesController } from './categories.controller';
import { TagsController } from './tags.controller';

@Module({
  controllers: [CategoriesController, TagsController],
  providers: [CategoriesTagsService],
  exports: [CategoriesTagsService],
})
export class CategoriesTagsModule {}
