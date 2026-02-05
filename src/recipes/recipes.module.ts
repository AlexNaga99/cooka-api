import { Module } from '@nestjs/common';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';
import { RatingsService } from './ratings.service';
import { AuthModule } from '../auth/auth.module';
import { CategoriesTagsModule } from '../categories-tags/categories-tags.module';

@Module({
  imports: [AuthModule, CategoriesTagsModule],
  controllers: [RecipesController],
  providers: [RecipesService, RatingsService],
  exports: [RecipesService, RatingsService],
})
export class RecipesModule {}
