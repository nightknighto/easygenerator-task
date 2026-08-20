import { createHash, randomBytes } from 'node:crypto';

/** Opaque 256-bit random token, URL-safe (what goes into emails/cookies). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256 hex digest — only the hash is persisted, never the raw token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
