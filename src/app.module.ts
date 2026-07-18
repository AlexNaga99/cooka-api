import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import appConfig from './config/app.config';
import { AuthModule } from './auth/auth.module';
import { RecipesModule } from './recipes/recipes.module';
import { SocialModule } from './social/social.module';
import { SearchModule } from './search/search.module';
import { CategoriesTagsModule } from './categories-tags/categories-tags.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'], load: [appConfig] }),
    ThrottlerModule.forRoot([
      // Limite padrão (rotas escritas em mais de uma rota ficam cobertas por este tier).
      // Para testes de carga (k6), ajuste esses limites ou desabilite o guard temporariamente.
      { name: 'short', ttl: 1000, limit: 20 },     // 20 req/s por IP
      { name: 'long', ttl: 60_000, limit: 600 },   // 600 req/min por IP
    ]),
    AuthModule,
    RecipesModule,
    SocialModule,
    SearchModule,
    CategoriesTagsModule,
    NotificationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
