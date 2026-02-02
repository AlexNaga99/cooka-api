import { writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('apiPrefix') ?? 'api';
  const port = configService.get<number>('port') ?? 3000;

  app.setGlobalPrefix(apiPrefix);

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: '*',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cooka API')
    .setDescription(
      'Backend API do Cooka – autenticação, receitas, interações sociais, rankings e validação de monetização.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Firebase ID Token' },
      'bearerAuth',
    )
    .addTag('Auth', 'Autenticação (Firebase)')
    .addTag('Recipes', 'Receitas')
    .addTag('Ratings', 'Avaliações e comentários')
    .addTag('Social', 'Seguidores e perfil')
    .addTag('Search', 'Busca')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Gera arquivos OpenAPI na raiz do projeto (para Flutter/codegen)
  const outputDir = process.cwd();
  const jsonPath = join(outputDir, 'openapi.json');
  const yamlPath = join(outputDir, 'swagger.yaml');
  writeFileSync(jsonPath, JSON.stringify(document, null, 2), 'utf-8');
  console.log(`OpenAPI gerado: ${jsonPath}`);
  try {
    const yaml = await import('yaml');
    writeFileSync(yamlPath, yaml.stringify(document), 'utf-8');
    console.log(`Swagger YAML gerado: ${yamlPath}`);
  } catch {
    // npm i yaml para gerar swagger.yaml
  }

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
    yamlDocumentUrl: 'docs/yaml',
  });

  await app.listen(port);
  console.log(`Cooka API: http://localhost:${port}/${apiPrefix}`);
  console.log(`Swagger UI: http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
