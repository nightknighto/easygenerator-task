/**
 * In-process e2e harness: boots the REAL AppModule via the Nest testing
 * module — no listening port, supertest talks to the express instance
 * directly. Middleware/prefix mirror `main.ts` so the routes under test are
 * exactly the production ones (including `cookie-parser`, which the auth
 * controller relies on to read the refresh cookie).
 *
 * `close()` drops the throwaway e2e database (see `setup-e2e.ts`) and shuts
 * the app down. The Mongoose models are exposed for assertions that need to
 * look at DB rows directly (revocation state, token expiry flips).
 */

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { AppModule } from '../../src/app.module';
import {
  SignupToken,
  type SignupTokenDocument,
} from '../../src/auth/schemas/signup-token.schema';
import {
  RefreshToken,
  type RefreshTokenDocument,
} from '../../src/auth/schemas/refresh-token.schema';
import { User, type UserDocument } from '../../src/users/schemas/user.schema';

export interface TestUser {
  id: string;
  email: string;
  name: string;
}

export interface E2eTestApp {
  app: INestApplication;
  connection: Connection;
  models: {
    users: Model<UserDocument>;
    signupTokens: Model<SignupTokenDocument>;
    refreshTokens: Model<RefreshTokenDocument>;
  };
  /** Drops the e2e database, then closes the app (call in afterAll). */
  close(): Promise<void>;
}

export async function createTestApp(): Promise<E2eTestApp> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  await app.init();

  const connection = app.get<Connection>(getConnectionToken());
  const models = {
    users: app.get<Model<UserDocument>>(getModelToken(User.name)),
    signupTokens: app.get<Model<SignupTokenDocument>>(
      getModelToken(SignupToken.name),
    ),
    refreshTokens: app.get<Model<RefreshTokenDocument>>(
      getModelToken(RefreshToken.name),
    ),
  };

  return {
    app,
    connection,
    models,
    async close() {
      // Mongoose builds indexes asynchronously after connect; let those
      // settle before wiping, or a late index build can re-create empty
      // collections after the drop.
      await Promise.all(
        Object.values(connection.models).map((model) =>
          model.init().catch(() => undefined),
        ),
      );
      await connection.dropDatabase();
      await app.close();
    },
  };
}
