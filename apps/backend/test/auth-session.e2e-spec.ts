import request from 'supertest';
import { createTestApp, type E2eTestApp } from './helpers/test-app';
import { CookieJar, findCookie } from './helpers/cookie-jar';
import { registerViaSignup, signIn } from './helpers/fixtures';
import { hashToken } from '../src/common/crypto/tokens';

describe('Auth session — /me, refresh, logout (e2e)', () => {
  let testApp: E2eTestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  // ------------------------------------------------------------------ /me ---

  describe('GET /api/auth/me', () => {
    it('returns 401 UNAUTHENTICATED without the access cookie', async () => {
      const res = await request(testApp.app.getHttpServer())
        .get('/api/auth/me')
        .expect(401);
      expect(res.body).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
      });
    });

    it('returns 401 for a garbage access cookie', async () => {
      await request(testApp.app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', 'accessToken=not-a-jwt')
        .expect(401);
    });

    it('returns the signed-in user with the access cookie', async () => {
      const { user } = await registerViaSignup(testApp.app, {
        name: 'Me Probe',
      });
      const { jar } = await signIn(testApp.app, user.email);

      const res = await request(testApp.app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', jar.headerFor('/api/auth/me'))
        .expect(200);
      expect(res.body).toEqual({
        id: user.id,
        email: user.email,
        name: 'Me Probe',
      });
    });
  });

  // ------------------------------------------------------------- refresh ---

  describe('POST /api/auth/refresh', () => {
    it('rotates the refresh cookie — the new one works, the old one is dead', async () => {
      const server = testApp.app.getHttpServer();
      const { user } = await registerViaSignup(testApp.app, {
        name: 'Rotation',
      });
      const { jar } = await signIn(testApp.app, user.email);
      const oldRefresh = jar.get('refreshToken')!.value;

      const rotated = await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${oldRefresh}`)
        .expect(200);
      expect(rotated.body).toEqual({
        id: user.id,
        email: user.email,
        name: 'Rotation',
      });

      const rotatedJar = new CookieJar().store(rotated);
      const newRefresh = rotatedJar.get('refreshToken')!.value;
      expect(newRefresh).toBeTruthy();
      expect(newRefresh).not.toBe(oldRefresh);
      // The rotated session's access cookie is accepted by /me.
      await request(server)
        .get('/api/auth/me')
        .set('Cookie', rotatedJar.headerFor('/api/auth/me'))
        .expect(200);

      // The presented (now revoked) token no longer refreshes.
      const replay = await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${oldRefresh}`)
        .expect(401);
      expect(replay.body.code).toBe('REFRESH_TOKEN_REUSED');
    });

    it('returns 401 REFRESH_TOKEN_INVALID without a cookie', async () => {
      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .expect(401);
      expect(res.body.code).toBe('REFRESH_TOKEN_INVALID');
    });

    it('reuse canary: replaying a revoked token kills the user’s OTHER sessions too', async () => {
      const server = testApp.app.getHttpServer();
      const { user } = await registerViaSignup(testApp.app, {
        name: 'Canary',
      });
      // Two independent browser sessions for the same account.
      const sessionA = await signIn(testApp.app, user.email);
      const sessionB = await signIn(testApp.app, user.email);
      const refreshA = sessionA.jar.get('refreshToken')!.value;
      const refreshB = sessionB.jar.get('refreshToken')!.value;

      // Rotate session A, then replay A's ORIGINAL (revoked) token.
      await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${refreshA}`)
        .expect(200);
      const replay = await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${refreshA}`)
        .expect(401);
      expect(replay.body.code).toBe('REFRESH_TOKEN_REUSED');

      // Session B's never-replayed token is collateral damage of the canary.
      await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${refreshB}`)
        .expect(401);

      // DB agrees: not a single live refresh row remains for the user.
      const liveRows = await testApp.models.refreshTokens
        .countDocuments({ userId: user.id, revokedAt: null })
        .exec();
      expect(liveRows).toBe(0);
    });
  });

  // -------------------------------------------------------------- logout ---

  describe('POST /api/auth/logout', () => {
    it('returns 204, clears both cookies and revokes the refresh row in the DB', async () => {
      const server = testApp.app.getHttpServer();
      const { user } = await registerViaSignup(testApp.app, {
        name: 'Logout',
      });
      const { jar } = await signIn(testApp.app, user.email);
      const refreshValue = jar.get('refreshToken')!.value;
      const tokenHash = hashToken(refreshValue);

      const res = await request(server)
        .post('/api/auth/logout')
        .set('Cookie', jar.headerFor('/api/auth/logout'))
        .expect(204);
      expect(res.text).toBe('');

      // Both cookies are cleared (empty value, expiry in the past).
      const clearedAccess = findCookie(res, 'accessToken');
      const clearedRefresh = findCookie(res, 'refreshToken');
      expect(clearedAccess?.value).toBe('');
      expect(clearedRefresh?.value).toBe('');
      expect(clearedAccess?.attributes.join(' ')).toMatch(
        /expires=thu, 01 jan 1970/,
      );

      // The DB row behind the presented cookie is revoked…
      const row = await testApp.models.refreshTokens
        .findOne({ tokenHash })
        .exec();
      expect(row?.revokedAt).toBeInstanceOf(Date);
      expect(row?.userId.toString()).toBe(user.id);

      // …so the old refresh cookie no longer works.
      await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${refreshValue}`)
        .expect(401);

      // Logging out again with the same (already revoked) cookie stays 204.
      await request(server)
        .post('/api/auth/logout')
        .set('Cookie', `refreshToken=${refreshValue}`)
        .expect(204);
    });

    it('is idempotent without any cookies — still 204', async () => {
      await request(testApp.app.getHttpServer())
        .post('/api/auth/logout')
        .expect(204);
    });
  });
});
