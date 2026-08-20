import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // '../../.env' resolves when cwd is apps/backend (nest/jest/turbo),
      // '.env' when the process is started from the repo root.
      envFilePath: ['../../.env', '.env'],
      validate: (config: Record<string, unknown>) => {
        if (!config.MONGODB_URI) {
          throw new Error(
            'MONGODB_URI is not set. Copy .env.example to .env in the repo root and restart (see README "Getting started").',
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
            logger.error(`MongoDB connection error: ${error.message}`, error.stack),
          );
          return connection;
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
