import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import type {
  SigninRequest,
  SigninResponse,
  SignupCompleteRequest,
  SignupCompleteResponse,
  SignupRequest,
  SignupVerifyRequest,
  SignupVerifyResponse,
  User,
} from '@app/shared';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { DomainException, ErrorCodes } from '../common/errors/domain.exception';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  ACCESS_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TTL_LONG_SECONDS,
  REFRESH_TTL_SHORT_SECONDS,
  SIGNUP_TOKEN_TTL_MS,
} from './auth.constants';
import { RefreshTokenService } from './refresh-token.service';
import { SignupTokenService } from './signup-token.service';
import type { UserDocument } from '../users/schemas/user.schema';

const GENERIC_SIGNUP_MESSAGE =
  'If this address can sign up, a sign-up link has been sent to it. Please check your inbox.';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly isProduction: boolean;
  private readonly frontendUrl: string;

  constructor(
    private readonly users: UsersService,
    private readonly signupTokens: SignupTokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
    this.frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
  }

  // -------------------------------------------------------------------------
  // Sign-up step 1 — always a generic success (anti-enumeration)
  // -------------------------------------------------------------------------

  async requestSignup(dto: SignupRequest): Promise<{ message: string }> {
    const email = dto.email;

    const existing = await this.users.findByEmail(email);
    if (existing) {
      return { message: GENERIC_SIGNUP_MESSAGE }; // silently do nothing
    }

    const { token } = await this.signupTokens.issue(email, SIGNUP_TOKEN_TTL_MS);
    await this.mail.sendSignupLink(
      email,
      `${this.frontendUrl}/signup/complete?token=${token}`,
    );

    return { message: GENERIC_SIGNUP_MESSAGE };
  }

  // -------------------------------------------------------------------------
  // Sign-up step 2 — check the token without consuming it
  // -------------------------------------------------------------------------

  async verifySignupToken(
    dto: SignupVerifyRequest,
  ): Promise<SignupVerifyResponse> {
    const row = await this.signupTokens.findByToken(dto.token);
    this.assertUsableSignupToken(row);
    return { email: row.email };
  }

  // -------------------------------------------------------------------------
  // Sign-up step 3 — consume the token and create the user
  // -------------------------------------------------------------------------

  async completeSignup(
    dto: SignupCompleteRequest,
  ): Promise<SignupCompleteResponse> {
    const row = await this.signupTokens.findByToken(dto.token);
    this.assertUsableSignupToken(row);
    const email = row.email;

    if (await this.users.findByEmail(email)) {
      throw new DomainException(
        ErrorCodes.EmailAlreadyRegistered,
        'This email address is already registered.',
        HttpStatus.CONFLICT,
      );
    }

    const consumed = await this.signupTokens.consume(dto.token);
    if (!consumed) {
      // Lost the race (concurrent completion) — re-check for a precise code.
      const fresh = await this.signupTokens.findByToken(dto.token);
      this.assertUsableSignupToken(fresh);
      throw new DomainException(
        ErrorCodes.SignupTokenConsumed,
        'This sign-up link has already been used.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      const user = await this.users.create(email, dto.name, passwordHash);
      return this.toUserResponse(user);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new DomainException(
          ErrorCodes.EmailAlreadyRegistered,
          'This email address is already registered.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Sign-in — generic 401 for unknown email AND wrong password
  // -------------------------------------------------------------------------

  async signin(dto: SigninRequest, res: Response): Promise<SigninResponse> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new DomainException(
        ErrorCodes.InvalidCredentials,
        'Invalid email or password.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.issueSession(user, dto.rememberMe, res);
    return this.toUserResponse(user);
  }

  // -------------------------------------------------------------------------
  // Refresh — rotate the DB-backed refresh token, detect reuse
  // -------------------------------------------------------------------------

  async refresh(
    rawToken: string | undefined,
    res: Response,
  ): Promise<SigninResponse> {
    if (!rawToken) {
      throw refreshError(ErrorCodes.RefreshTokenInvalid);
    }

    const row = await this.refreshTokens.findByToken(rawToken);
    if (!row) {
      throw refreshError(ErrorCodes.RefreshTokenInvalid);
    }
    if (row.revokedAt) {
      // Reuse of a rotated/revoked token — assume theft, kill every session.
      await this.refreshTokens.revokeAllForUser(row.userId);
      throw refreshError(ErrorCodes.RefreshTokenReused);
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw refreshError(ErrorCodes.RefreshTokenExpired);
    }

    const rotated = await this.refreshTokens.revoke(rawToken);
    if (!rotated) {
      await this.refreshTokens.revokeAllForUser(row.userId);
      throw refreshError(ErrorCodes.RefreshTokenReused);
    }

    const user = await this.users.findById(String(row.userId));
    if (!user) {
      await this.refreshTokens.revokeAllForUser(row.userId);
      throw refreshError(ErrorCodes.Unauthenticated);
    }

    // The new row inherits the original rememberMe policy.
    await this.issueSession(user, row.rememberMe, res);
    return this.toUserResponse(user);
  }

  // -------------------------------------------------------------------------
  // Logout — revoke when the cookie maps to a live row; always 204
  // -------------------------------------------------------------------------

  async logout(rawToken: string | undefined, res: Response): Promise<void> {
    if (rawToken) {
      const row = await this.refreshTokens.findByToken(rawToken);
      if (row && !row.revokedAt) {
        await this.refreshTokens.revoke(rawToken);
      }
    }
    this.clearAuthCookies(res);
  }

  // -------------------------------------------------------------------------
  // Shared helpers
  // -------------------------------------------------------------------------

  private async issueSession(
    user: UserDocument,
    rememberMe: boolean,
    res: Response,
  ) {
    const accessToken = await this.jwt.signAsync(
      { sub: String(user._id), email: user.email },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
    const { token: refreshToken } = await this.refreshTokens.issue(
      user._id,
      rememberMe,
    );

    const refreshTtlSeconds = rememberMe
      ? REFRESH_TTL_LONG_SECONDS
      : REFRESH_TTL_SHORT_SECONDS;
    const common = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.isProduction,
    };
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...common,
      path: ACCESS_COOKIE_PATH,
      maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    });
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...common,
      path: REFRESH_COOKIE_PATH,
      maxAge: refreshTtlSeconds * 1000,
    });
  }

  private clearAuthCookies(res: Response): void {
    const common = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.isProduction,
    };
    res.clearCookie(ACCESS_TOKEN_COOKIE, {
      ...common,
      path: ACCESS_COOKIE_PATH,
    });
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...common,
      path: REFRESH_COOKIE_PATH,
    });
  }

  private assertUsableSignupToken(
    row: { email: string; expiresAt: Date; consumedAt: Date | null } | null,
  ): asserts row is {
    email: string;
    expiresAt: Date;
    consumedAt: Date | null;
  } {
    if (!row) {
      throw new DomainException(
        ErrorCodes.SignupTokenInvalid,
        'This sign-up link is invalid.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (row.consumedAt) {
      throw new DomainException(
        ErrorCodes.SignupTokenConsumed,
        'This sign-up link has already been used.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new DomainException(
        ErrorCodes.SignupTokenExpired,
        'This sign-up link has expired. Please start the sign-up again.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private toUserResponse(user: UserDocument): User {
    return { id: String(user._id), email: user.email, name: user.name };
  }
}

function refreshError(code: string): DomainException {
  const messages: Record<string, string> = {
    [ErrorCodes.RefreshTokenInvalid]: 'Refresh token is invalid.',
    [ErrorCodes.RefreshTokenExpired]:
      'Refresh token has expired. Please sign in again.',
    [ErrorCodes.RefreshTokenReused]:
      'Refresh token reuse detected. All sessions were revoked.',
    [ErrorCodes.Unauthenticated]: 'Session user no longer exists.',
  };
  return new DomainException(
    code,
    messages[code] ?? 'Refresh failed.',
    HttpStatus.UNAUTHORIZED,
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}
