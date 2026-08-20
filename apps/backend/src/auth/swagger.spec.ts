import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppController } from '../app.controller';
import { AppService } from '../app.service';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Builds the Swagger document in-process (no HTTP, no Mongo) and asserts the
 * API surface stays fully documented: every endpoint present, component
 * schemas derived from the @app/shared Zod definitions, and no dangling $refs.
 */
describe('OpenAPI document', () => {
  let app: INestApplication;
  let document: Record<string, any>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, AppController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: UsersService, useValue: {} },
        AppService,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Easygenerator Auth API')
        .setVersion('1.0')
        .build(),
    );
  });

  afterAll(() => app.close());

  it('documents every endpoint', () => {
    expect(Object.keys(document.paths).sort()).toEqual([
      '/',
      '/auth/logout',
      '/auth/me',
      '/auth/refresh',
      '/auth/signin',
      '/auth/signup/complete',
      '/auth/signup/request',
      '/auth/signup/verify',
    ]);
  });

  it('derives component schemas from the shared Zod definitions', () => {
    const schemas = Object.keys(document.components?.schemas ?? {});
    for (const expected of [
      'SignupRequestDto',
      'SignupVerifyRequestDto',
      'SignupCompleteRequestDto',
      'SigninRequestDto',
      'SigninResponseDto',
      'SignupVerifyResponseDto',
      'SignupCompleteResponseDto',
      'MessageResponseDto',
      'ApiErrorDto',
    ]) {
      expect(schemas).toContain(expected);
    }

    // The zod v4 bridge must render actual constraints, not empty objects.
    const signin = JSON.stringify(document.components.schemas.SigninRequestDto);
    expect(signin).toContain('rememberMe');
    const password = JSON.stringify(
      document.components.schemas.SignupCompleteRequestDto,
    );
    expect(password).toContain('minLength');
  });

  it('has no dangling $refs', () => {
    const componentNames = new Set(
      Object.keys(document.components?.schemas ?? {}).map(
        (name) => `#/components/schemas/${name}`,
      ),
    );
    const dangling: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          if (
            key === '$ref' &&
            typeof value === 'string' &&
            !componentNames.has(value)
          ) {
            dangling.push(value);
          }
          walk(value);
        }
      }
    };
    walk(document);
    expect(dangling).toEqual([]);
  });
});
