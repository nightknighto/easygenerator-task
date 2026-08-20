import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Easygenerator Auth API')
    .setDescription(
      'Authentication API for the sign-up / sign-in flow. ' +
        'All bodies are validated by the same Zod schemas that generate the ' +
        'request/response models below (single source of truth in `@app/shared`).\n\n' +
        'Authentication is cookie-based and invisible to Swagger UI: ' +
        '`POST /auth/signin` and `POST /auth/refresh` set httpOnly ' +
        '`accessToken` / `refreshToken` cookies that the browser sends ' +
        'automatically, so protected endpoints cannot be authorized via the ' +
        'Authorize button — call them from a signed-in browser session or a ' +
        'cookie jar instead. Errors always use the `API error` envelope.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document, {
    jsonDocumentUrl: 'api-docs-json',
  });

  const config = app.get(ConfigService);
  const port = Number(config.get<string | number>('PORT') ?? 3000);
  await app.listen(port);
}
void bootstrap();
