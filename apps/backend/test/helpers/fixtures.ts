/**
 * API-level fixtures: everything is exercised over HTTP against the real
 * AppModule — users are created through the actual 3-step signup walk, with
 * the emailed token fetched from MailPit. Emails are unique per call so tests
 * stay order-independent and re-runnable against the shared catchers.
 */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { CookieJar } from './cookie-jar';
import { waitForSignupToken } from './mailpit';
import type { TestUser } from './test-app';

/** Satisfies the shared password policy (letter + number + special, ≥8). */
export const STRONG_PASSWORD = 'E2e-Passw0rd!';

export function uniqueEmail(): string {
  return `e2e-${randomUUID()}@example.com`;
}

/**
 * Walks the full signup over HTTP + MailPit: request → emailed token →
 * complete. Returns the created account (and the consumed token).
 */
export async function registerViaSignup(
  app: INestApplication,
  {
    email = uniqueEmail(),
    name = 'E2e Walker',
    password = STRONG_PASSWORD,
  }: { email?: string; name?: string; password?: string } = {},
): Promise<{ user: TestUser; email: string; password: string; token: string }> {
  await request(app.getHttpServer())
    .post('/api/auth/signup/request')
    .send({ email })
    .expect(200);

  const token = await waitForSignupToken(email);

  const res = await request(app.getHttpServer())
    .post('/api/auth/signup/complete')
    .send({ token, name, password })
    .expect(201);
  const user = res.body as TestUser;

  return { user, email, password, token };
}

/** Signs in over HTTP; returns the user body plus a jar with both cookies. */
export async function signIn(
  app: INestApplication,
  email: string,
  password: string = STRONG_PASSWORD,
  rememberMe = false,
): Promise<{ user: TestUser; jar: CookieJar }> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/signin')
    .send({ email, password, rememberMe })
    .expect(200);
  return { user: res.body as TestUser, jar: new CookieJar().store(res) };
}
