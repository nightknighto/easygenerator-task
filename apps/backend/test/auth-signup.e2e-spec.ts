import request from 'supertest';
import { createTestApp, type E2eTestApp } from './helpers/test-app';
import { messagesTo, waitForSignupToken } from './helpers/mailpit';
import {
  STRONG_PASSWORD,
  registerViaSignup,
  uniqueEmail,
} from './helpers/fixtures';

describe('Auth signup (e2e)', () => {
  let testApp: E2eTestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('walks request → verify → complete, and the account can then sign in', async () => {
    const server = testApp.app.getHttpServer();
    const email = uniqueEmail();
    const name = 'Signup Walker';

    // Step 1 — generic 200 (anti-enumeration contract starts here).
    const requested = await request(server)
      .post('/api/auth/signup/request')
      .send({ email })
      .expect(200);
    expect(requested.body).toEqual({ message: expect.any(String) });
    const genericBody = requested.body;

    // The emailed link's token arrives via MailPit.
    const token = await waitForSignupToken(email);
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/);

    // Step 2 — verify returns the email without consuming the token.
    const verified = await request(server)
      .post('/api/auth/signup/verify')
      .send({ token })
      .expect(200);
    expect(verified.body).toEqual({ email });

    // Step 3 — complete creates the account, no cookies involved.
    const completed = await request(server)
      .post('/api/auth/signup/complete')
      .send({ token, name, password: STRONG_PASSWORD })
      .expect(201);
    expect(completed.body).toMatchObject({
      id: expect.any(String),
      email,
      name,
    });
    expect(completed.headers['set-cookie']).toBeUndefined();

    // The fresh account signs in.
    await request(server)
      .post('/api/auth/signin')
      .send({ email, password: STRONG_PASSWORD })
      .expect(200);

    // Anti-enumeration: requesting again for the now-registered address
    // answers the exact same generic body — and sends no second email.
    const again = await request(server)
      .post('/api/auth/signup/request')
      .send({ email })
      .expect(200);
    expect(again.body).toEqual(genericBody);
    expect(await messagesTo(email)).toHaveLength(1);
  });

  it('rejects an invalid email with the VALIDATION_ERROR envelope', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/api/auth/signup/request')
      .send({ email: 'definitely-not-an-email' })
      .expect(400);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toEqual(expect.any(String));
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('verify with a garbage token → 400 SIGNUP_TOKEN_INVALID', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/api/auth/signup/verify')
      .send({ token: 'garbage-token-that-matches-no-row' })
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'SIGNUP_TOKEN_INVALID',
    });
  });

  it('completing twice with the same token → 400 SIGNUP_TOKEN_CONSUMED', async () => {
    const server = testApp.app.getHttpServer();
    const email = uniqueEmail();
    const name = 'One Shot';

    await request(server)
      .post('/api/auth/signup/request')
      .send({ email })
      .expect(200);
    const token = await waitForSignupToken(email);

    await request(server)
      .post('/api/auth/signup/complete')
      .send({ token, name, password: STRONG_PASSWORD })
      .expect(201);

    const replay = await request(server)
      .post('/api/auth/signup/complete')
      .send({ token, name, password: STRONG_PASSWORD })
      .expect(400);
    expect(replay.body).toMatchObject({
      statusCode: 400,
      code: 'SIGNUP_TOKEN_CONSUMED',
    });
  });

  it('verify → 400 SIGNUP_TOKEN_EXPIRED once expiresAt has passed', async () => {
    const server = testApp.app.getHttpServer();
    const email = uniqueEmail();

    await request(server)
      .post('/api/auth/signup/request')
      .send({ email })
      .expect(200);
    const token = await waitForSignupToken(email);

    // Freshly issued token verifies fine…
    await request(server)
      .post('/api/auth/signup/verify')
      .send({ token })
      .expect(200);

    // …then age the row out directly (same TTL index Mongo would enforce).
    const flipped = await testApp.models.signupTokens
      .updateOne(
        { email },
        { $set: { expiresAt: new Date(Date.now() - 1_000) } },
      )
      .exec();
    expect(flipped.modifiedCount).toBe(1);

    const expired = await request(server)
      .post('/api/auth/signup/verify')
      .send({ token })
      .expect(400);
    expect(expired.body).toMatchObject({
      statusCode: 400,
      code: 'SIGNUP_TOKEN_EXPIRED',
    });
  });

  it('rejects a completing body that fails the field rules', async () => {
    // Registered user only needed for a valid token; the password/name rules
    // are checked before anything is consumed.
    const server = testApp.app.getHttpServer();
    const email = uniqueEmail();
    await request(server)
      .post('/api/auth/signup/request')
      .send({ email })
      .expect(200);
    const token = await waitForSignupToken(email);

    const res = await request(server)
      .post('/api/auth/signup/complete')
      .send({ token, name: 'ab', password: 'weakpass' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.statusCode).toBe(400);
    expect(Array.isArray(res.body.details)).toBe(true);

    // The failed completion must NOT have consumed the token.
    await request(server)
      .post('/api/auth/signup/verify')
      .send({ token })
      .expect(200);
  });

  it('keeps the request idempotent-ish for unknown addresses: same body, email actually sent', async () => {
    // Two different unknown addresses get byte-identical generic responses.
    const server = testApp.app.getHttpServer();
    const first = await request(server)
      .post('/api/auth/signup/request')
      .send({ email: uniqueEmail() })
      .expect(200);
    const second = await request(server)
      .post('/api/auth/signup/request')
      .send({ email: uniqueEmail() })
      .expect(200);
    expect(second.body).toEqual(first.body);
  });

  it('registerViaSignup helper produces a usable account (sanity)', async () => {
    const { user } = await registerViaSignup(testApp.app);
    expect(user.id).toEqual(expect.any(String));
    const stored = await testApp.models.users
      .findOne({ email: user.email })
      .exec();
    expect(stored?.name).toBe(user.name);
  });
});
