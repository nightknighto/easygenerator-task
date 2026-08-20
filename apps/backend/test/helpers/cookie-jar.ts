/**
 * Minimal cookie jar for supertest: collects `Set-Cookie` headers from
 * responses and replays them as a `Cookie` header — the tests play the role
 * of the browser for the app's httpOnly cookies.
 *
 * Deliberately path-aware (RFC 6265 path matching): the app scopes
 * `accessToken` to `/api` and `refreshToken` to `/api/auth`, and the suite
 * verifies that scoping by only ever sending what a conforming browser would.
 */

import type { Response } from 'supertest';

export interface StoredCookie {
  name: string;
  value: string;
  /** Effective path (defaults to `/` when the attribute is absent). */
  path: string;
  /** Lowercased attribute strings (`path=/api`, `httponly`, `samesite=lax`, …). */
  attributes: string[];
  /** The raw `Set-Cookie` line this was parsed from. */
  raw: string;
}

export function parseSetCookies(res: Response): StoredCookie[] {
  const raw = res.headers['set-cookie'] as unknown as
    string[] | string | undefined;
  if (!raw) return [];
  const lines = Array.isArray(raw) ? raw : [raw];
  return lines.map((line) => {
    const [nameValue, ...attributeParts] = line.split(';');
    const eq = nameValue.indexOf('=');
    const attributes = attributeParts.map((part) => part.trim().toLowerCase());
    const pathAttribute = attributes.find((part) => part.startsWith('path='));
    return {
      name: nameValue.slice(0, eq).trim(),
      value: nameValue.slice(eq + 1).trim(),
      path: pathAttribute ? pathAttribute.slice('path='.length) : '/',
      attributes,
      raw: line,
    };
  });
}

export function findCookie(
  res: Response,
  name: string,
): StoredCookie | undefined {
  return parseSetCookies(res).find((cookie) => cookie.name === name);
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (!requestPath.startsWith(cookiePath)) return false;
  if (requestPath === cookiePath) return true;
  return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/';
}

export class CookieJar {
  private readonly cookies = new Map<string, StoredCookie>();

  /** Stores the latest version of every cookie, like a browser would. */
  store(res: Response): this {
    for (const cookie of parseSetCookies(res)) {
      this.cookies.set(cookie.name, cookie);
    }
    return this;
  }

  get(name: string): StoredCookie | undefined {
    return this.cookies.get(name);
  }

  /** Cookies a browser would attach to a request for `requestPath`. */
  cookiesFor(requestPath: string): StoredCookie[] {
    return [...this.cookies.values()].filter((cookie) =>
      pathMatches(requestPath, cookie.path),
    );
  }

  /** The `Cookie` header value for a request to `requestPath`. */
  headerFor(requestPath: string): string {
    return this.cookiesFor(requestPath)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }

  /** A single `name=value` pair, handy for replaying one specific token. */
  pair(name: string): string | undefined {
    const cookie = this.cookies.get(name);
    return cookie ? `${cookie.name}=${cookie.value}` : undefined;
  }
}
