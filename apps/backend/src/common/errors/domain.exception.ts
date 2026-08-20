import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain-level error carrying a machine-readable `code` (e.g.
 * `INVALID_CREDENTIALS`, `SIGNUP_TOKEN_EXPIRED`). The global exception filter
 * renders it as the shared error envelope `{ statusCode, code, message, details? }`.
 */
export class DomainException extends HttpException {
  readonly errorCode: string;
  readonly details?: unknown;

  constructor(
    errorCode: string,
    message: string,
    statusCode: HttpStatus,
    details?: unknown,
  ) {
    super({ code: errorCode, message }, statusCode);
    this.errorCode = errorCode;
    this.details = details;
  }
}

export const ErrorCodes = {
  Validation: 'VALIDATION_ERROR',
  InvalidCredentials: 'INVALID_CREDENTIALS',
  Unauthenticated: 'UNAUTHENTICATED',
  SignupTokenInvalid: 'SIGNUP_TOKEN_INVALID',
  SignupTokenExpired: 'SIGNUP_TOKEN_EXPIRED',
  SignupTokenConsumed: 'SIGNUP_TOKEN_CONSUMED',
  EmailAlreadyRegistered: 'EMAIL_ALREADY_REGISTERED',
  RefreshTokenInvalid: 'REFRESH_TOKEN_INVALID',
  RefreshTokenExpired: 'REFRESH_TOKEN_EXPIRED',
  RefreshTokenReused: 'REFRESH_TOKEN_REUSED',
  Internal: 'INTERNAL_ERROR',
} as const;
