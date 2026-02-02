import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { AuthModule } from '../auth/auth.module';
import { RecipesModule } from '../recipes/recipes.module';

@Module({
  imports: [AuthModule, RecipesModule],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
