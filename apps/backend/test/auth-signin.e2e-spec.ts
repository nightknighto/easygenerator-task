import request from 'supertest';
import { createTestApp, type E2eTestApp } from './helpers/test-app';
import { findCookie } from './helpers/cookie-jar';
import { uniqueEmail, registerViaSignup } from './helpers/fixtures';

describe('Auth signin (e2e)', () => {
  let testApp: E2eTestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('rejects a malformed body with the VALIDATION_ERROR envelope', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/api/auth/signin')
      .send({ email: 'definitely-not-an-email', password: '' })
      .expect(400);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toEqual(expect.any(String));
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('signs in a registered user and sets both scoped httpOnly cookies', async () => {
    const server = testApp.app.getHttpServer();
    const { user } = await registerViaSignup(testApp.app, {
      name: 'Cookie Check',
    });

    const res = await request(server)
      .post('/api/auth/signin')
      .send({ email: user.email, password: 'E2e-Passw0rd!' })
      .expect(200);
    expect(res.body).toEqual({
      id: user.id,
      email: user.email,
      name: 'Cookie Check',
    });

    const access = findCookie(res, 'accessToken');
    const refresh = findCookie(res, 'refreshToken');
    expect(access).toBeDefined();
    expect(refresh).toBeDefined();
    expect(access!.value).not.toBe('');
    expect(refresh!.value).not.toBe('');

    // httpOnly + SameSite=Lax on both.
    for (const cookie of [access!, refresh!]) {
      expect(cookie.attributes).toContain('httponly');
      expect(cookie.attributes).toContain('samesite=lax');
    }
    // Path scoping: access rides /api, refresh only /api/auth.
    expect(access!.attributes).toContain('path=/api');
    expect(access!.attributes).not.toContain('path=/api/auth');
    expect(refresh!.attributes).toContain('path=/api/auth');
  });

  it('answers wrong password and unknown email with an identical generic 401', async () => {
    const server = testApp.app.getHttpServer();
    const { user } = await registerViaSignup(testApp.app);

    const wrongPassword = await request(server)
      .post('/api/auth/signin')
      .send({ email: user.email, password: 'not-the-right-one-1!' })
      .expect(401);
    const unknownEmail = await request(server)
      .post('/api/auth/signin')
      .send({ email: uniqueEmail(), password: 'not-the-right-one-1!' })
      .expect(401);

    expect(unknownEmail.body).toEqual(wrongPassword.body); // identical, no oracle
    expect(wrongPassword.body.statusCode).toBe(401);
    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.body.message).toEqual(expect.any(String));
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
  });
});
