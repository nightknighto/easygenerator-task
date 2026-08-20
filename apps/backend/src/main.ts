import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);
  const port = Number(config.get<string | number>('PORT') ?? 3000);
  await app.listen(port);
}
void bootstrap();
