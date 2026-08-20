/**
 * Jest `setupFiles` entry — runs in every worker BEFORE any test module (and
 * therefore before `AppModule`) is imported. That ordering is what makes the
 * overrides hermetic: `@nestjs/config` layers env files UNDER `process.env`
 * (dotenv never overrides pre-set keys), so even though AppModule also loads
 * the repo-root `.env`, the values pinned here are the ones the app sees.
 *
 * What this pins:
 * - `MONGODB_URI` → the repo-root URI with the database swapped to a dedicated
 *   throwaway `easygenerator_e2e` database (same host/credentials/authSource),
 *   so e2e traffic never touches the dev database. Dropped in afterAll.
 * - SMTP → the local MailPit catcher, FRONTEND_URL and ACCESS_TOKEN_SECRET →
 *   values that work without the repo-root `.env` (CI), while `.env` values
 *   are still preferred when present.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { URL } from 'node:url';

const E2E_DATABASE = 'easygenerator_e2e';

/** Minimal KEY=VALUE parser (comments + quoted values) for the repo-root .env. */
function parseEnvFile(raw: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

/** Same host/credentials/authSource, dedicated database. */
function toE2eUri(uri: string): string {
  const parsed = new URL(uri);
  parsed.pathname = `/${E2E_DATABASE}`;
  return parsed.toString();
}

// apps/backend/test → repo root; works no matter the jest cwd.
const rootEnvPath = resolve(dirname(__dirname), '../..', '.env');
let fileEnv: Record<string, string> = {};
try {
  fileEnv = parseEnvFile(readFileSync(rootEnvPath, 'utf8'));
} catch {
  // No repo-root .env — fall back to plain defaults below (CI-friendly).
}

// Pre-set process.env wins over file values, mirroring dotenv precedence.
const fromFile = (key: string, fallback: string): string =>
  process.env[key] ?? fileEnv[key] ?? fallback;

const mongoUri = fromFile('MONGODB_URI', '');
if (!mongoUri) {
  throw new Error(
    'e2e setup: MONGODB_URI is not set and no repo-root .env was found. ' +
      'Copy .env.example to .env in the repo root (see README "Getting started").',
  );
}

process.env.MONGODB_URI = toE2eUri(mongoUri);
process.env.SMTP_HOST = fromFile('SMTP_HOST', 'localhost');
process.env.SMTP_PORT = fromFile('SMTP_PORT', '1025');
process.env.SMTP_FROM = fromFile(
  'SMTP_FROM',
  'Easygenerator E2E <no-reply@localhost>',
);
process.env.FRONTEND_URL = fromFile('FRONTEND_URL', 'http://localhost:5173');
process.env.ACCESS_TOKEN_SECRET = fromFile(
  'ACCESS_TOKEN_SECRET',
  'e2e-only-access-token-secret',
);

console.log(
  `[e2e] hermetic env: mongo db "${E2E_DATABASE}", smtp ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`,
);
