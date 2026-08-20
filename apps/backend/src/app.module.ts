import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // '../../.env' resolves when cwd is apps/backend (nest/jest/turbo),
      // '.env' when the process is started from the repo root.
      envFilePath: ['../../.env', '.env'],
      validate: (config: Record<string, unknown>) => {
        const required = [
          'MONGODB_URI',
          'SMTP_HOST',
          'SMTP_PORT',
          'SMTP_FROM',
          'FRONTEND_URL',
          'ACCESS_TOKEN_SECRET',
        ];
        const missing = required.filter((key) => !config[key]);
        if (missing.length > 0) {
          throw new Error(
            `Missing required env ${missing.join(', ')}. Copy .env.example to .env in the repo root and restart (see README "Getting started").`,
          );
        }
        return config;
      },
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        onConnectionCreate: (connection: Connection) => {
          const logger = new Logger('MongoDB');
          connection.on('connected', () => logger.log('MongoDB connected'));
          connection.on('error', (error: Error) =>
            logger.error(
              `MongoDB connection error: ${error.message}`,
              error.stack,
            ),
          );
          return connection;
        },
      }),
    }),
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
