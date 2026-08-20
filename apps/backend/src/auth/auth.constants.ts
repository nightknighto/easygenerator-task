export const ACCESS_TOKEN_COOKIE = 'accessToken';
export const REFRESH_TOKEN_COOKIE = 'refreshToken';

/** Refresh cookie is scoped so only the refresh endpoint receives it. */
export const REFRESH_COOKIE_PATH = '/api/auth/refresh';
export const ACCESS_COOKIE_PATH = '/api';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TTL_SHORT_SECONDS = 24 * 60 * 60; // 1 day (no rememberMe)
export const REFRESH_TTL_LONG_SECONDS = 30 * 24 * 60 * 60; // 30 days (rememberMe)

export const SIGNUP_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
