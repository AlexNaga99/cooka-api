import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import { AuthModule } from './auth/auth.module';
import { RecipesModule } from './recipes/recipes.module';
import { SocialModule } from './social/social.module';
import { SearchModule } from './search/search.module';
import { CategoriesTagsModule } from './categories-tags/categories-tags.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'], load: [appConfig] }),
    AuthModule,
    RecipesModule,
    SocialModule,
    SearchModule,
    CategoriesTagsModule,
  ],
})
export class AppModule {}
