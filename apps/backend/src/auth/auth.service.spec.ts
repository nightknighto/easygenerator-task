import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { SignupTokenService } from './signup-token.service';
import { RefreshTokenService } from './refresh-token.service';
import { DomainException } from '../common/errors/domain.exception';

const PASSWORD_HASH = bcrypt.hashSync('Password1!', 4);
const FUTURE = () => new Date(Date.now() + 60 * 60 * 1000);
const PAST = () => new Date(Date.now() - 60 * 60 * 1000);

function fakeUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'user-id-1',
    email: 'jane@example.com',
    name: 'Jane Doe',
    passwordHash: PASSWORD_HASH,
    ...overrides,
  };
}

function fakeResponse(): Response & {
  cookie: jest.Mock;
  clearCookie: jest.Mock;
} {
  return { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as ReturnType<
    typeof fakeResponse
  >;
}

function makeConfig(): ConfigService {
  return {
    get: (key: string) => (key === 'NODE_ENV' ? 'test' : undefined),
    getOrThrow: (key: string) => {
      if (key === 'FRONTEND_URL') return 'http://localhost:5173';
      throw new Error(`Unexpected config key ${key}`);
    },
  } as unknown as ConfigService;
}

async function expectDomainError(
  promise: Promise<unknown>,
  code: string,
  status: number,
) {
  let caught: unknown;
  await promise.catch((error: unknown) => (caught = error));
  expect(caught).toBeInstanceOf(DomainException);
  const error = caught as DomainException;
  expect(error.errorCode).toBe(code);
  expect(error.getStatus()).toBe(status);
  return error;
}

describe('AuthService', () => {
  let service: AuthService;
  let users: { findByEmail: jest.Mock; findById: jest.Mock; create: jest.Mock };
  let signupTokens: {
    issue: jest.Mock;
    findByToken: jest.Mock;
    consume: jest.Mock;
  };
  let refreshTokens: {
    issue: jest.Mock;
    findByToken: jest.Mock;
    revoke: jest.Mock;
    revokeAllForUser: jest.Mock;
  };
  let mail: { sendSignupLink: jest.Mock };
  let jwt: { signAsync: jest.Mock };

  beforeEach(async () => {
    users = { findByEmail: jest.fn(), findById: jest.fn(), create: jest.fn() };
    signupTokens = {
      issue: jest.fn(),
      findByToken: jest.fn(),
      consume: jest.fn(),
    };
    refreshTokens = {
      issue: jest.fn(),
      findByToken: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    mail = { sendSignupLink: jest.fn() };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed-access-token') };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: SignupTokenService, useValue: signupTokens },
        { provide: RefreshTokenService, useValue: refreshTokens },
        { provide: MailService, useValue: mail },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: makeConfig() },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('requestSignup', () => {
    it('issues a single-use token and emails the signup link for a new email', async () => {
      users.findByEmail.mockResolvedValue(null);
      signupTokens.issue.mockResolvedValue({
        token: 'raw-token',
        expiresAt: FUTURE(),
      });
      mail.sendSignupLink.mockResolvedValue(undefined);

      const result = await service.requestSignup({ email: 'new@example.com' });

      expect(result).toEqual({
        message:
          'If this address can sign up, a sign-up link has been sent to it. Please check your inbox.',
      });
      expect(signupTokens.issue).toHaveBeenCalledWith(
        'new@example.com',
        60 * 60 * 1000,
      );
      expect(mail.sendSignupLink).toHaveBeenCalledTimes(1);
      expect(mail.sendSignupLink.mock.calls[0][0]).toBe('new@example.com');
      expect(mail.sendSignupLink.mock.calls[0][1]).toBe(
        'http://localhost:5173/signup/complete?token=raw-token',
      );
    });

    it('silently does nothing for an already registered email but still returns the generic success', async () => {
      users.findByEmail.mockResolvedValue(fakeUser());

      const result = await service.requestSignup({ email: 'jane@example.com' });

      expect(result.message).toBe(
        'If this address can sign up, a sign-up link has been sent to it. Please check your inbox.',
      );
      expect(signupTokens.issue).not.toHaveBeenCalled();
      expect(mail.sendSignupLink).not.toHaveBeenCalled();
    });
  });

  describe('verifySignupToken', () => {
    it('returns the email for a valid token without consuming it', async () => {
      signupTokens.findByToken.mockResolvedValue({
        email: 'new@example.com',
        expiresAt: FUTURE(),
        consumedAt: null,
      });

      await expect(
        service.verifySignupToken({ token: 'raw-token' }),
      ).resolves.toEqual({
        email: 'new@example.com',
      });
      expect(signupTokens.consume).not.toHaveBeenCalled();
    });

    it('fails with SIGNUP_TOKEN_INVALID for an unknown token', async () => {
      signupTokens.findByToken.mockResolvedValue(null);
      await expectDomainError(
        service.verifySignupToken({ token: 'unknown' }),
        'SIGNUP_TOKEN_INVALID',
        400,
      );
    });

    it('fails with SIGNUP_TOKEN_EXPIRED for an expired token', async () => {
      signupTokens.findByToken.mockResolvedValue({
        email: 'new@example.com',
        expiresAt: PAST(),
        consumedAt: null,
      });
      await expectDomainError(
        service.verifySignupToken({ token: 'raw-token' }),
        'SIGNUP_TOKEN_EXPIRED',
        400,
      );
    });

    it('fails with SIGNUP_TOKEN_CONSUMED for an already used token', async () => {
      signupTokens.findByToken.mockResolvedValue({
        email: 'new@example.com',
        expiresAt: FUTURE(),
        consumedAt: PAST(),
      });
      await expectDomainError(
        service.verifySignupToken({ token: 'raw-token' }),
        'SIGNUP_TOKEN_CONSUMED',
        400,
      );
    });
  });

  describe('completeSignup', () => {
    const dto = {
      token: 'raw-token',
      name: 'Jane Doe',
      password: 'Password1!',
    };

    function givenValidTokenRow() {
      signupTokens.findByToken.mockResolvedValue({
        email: 'new@example.com',
        expiresAt: FUTURE(),
        consumedAt: null,
      });
    }

    it('consumes the token, stores a bcrypt hash and returns the created user', async () => {
      givenValidTokenRow();
      signupTokens.consume.mockResolvedValue({
        email: 'new@example.com',
        consumedAt: new Date(),
      });
      users.findByEmail.mockResolvedValue(null);
      users.create.mockResolvedValue(
        fakeUser({
          _id: 'created-id',
          email: 'new@example.com',
          name: 'Jane Doe',
        }),
      );

      await expect(service.completeSignup(dto)).resolves.toEqual({
        id: 'created-id',
        email: 'new@example.com',
        name: 'Jane Doe',
      });

      expect(signupTokens.consume).toHaveBeenCalledWith('raw-token');
      expect(users.create).toHaveBeenCalledTimes(1);
      const [email, name, passwordHash] = users.create.mock.calls[0];
      expect(email).toBe('new@example.com');
      expect(name).toBe('Jane Doe');
      expect(passwordHash).not.toBe(dto.password);
      await expect(bcrypt.compare(dto.password, passwordHash)).resolves.toBe(
        true,
      );
    });

    it('rejects with EMAIL_ALREADY_REGISTERED (409) when the email exists', async () => {
      givenValidTokenRow();
      users.findByEmail.mockResolvedValue(fakeUser());

      await expectDomainError(
        service.completeSignup(dto),
        'EMAIL_ALREADY_REGISTERED',
        409,
      );
      expect(signupTokens.consume).not.toHaveBeenCalled();
      expect(users.create).not.toHaveBeenCalled();
    });

    it('rejects with EMAIL_ALREADY_REGISTERED (409) when create hits a duplicate key (race)', async () => {
      givenValidTokenRow();
      signupTokens.consume.mockResolvedValue({ consumedAt: new Date() });
      users.findByEmail.mockResolvedValue(null);
      users.create.mockRejectedValue(
        Object.assign(new Error('E11000 duplicate key'), { code: 11000 }),
      );

      await expectDomainError(
        service.completeSignup(dto),
        'EMAIL_ALREADY_REGISTERED',
        409,
      );
    });

    it('rejects with SIGNUP_TOKEN_CONSUMED when the token was already used', async () => {
      signupTokens.findByToken.mockResolvedValue({
        email: 'new@example.com',
        expiresAt: FUTURE(),
        consumedAt: PAST(),
      });
      await expectDomainError(
        service.completeSignup(dto),
        'SIGNUP_TOKEN_CONSUMED',
        400,
      );
    });

    it('rejects with SIGNUP_TOKEN_CONSUMED when the atomic consume loses the race', async () => {
      givenValidTokenRow();
      signupTokens.consume.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);

      await expectDomainError(
        service.completeSignup(dto),
        'SIGNUP_TOKEN_CONSUMED',
        400,
      );
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('signin', () => {
    const dto = {
      email: 'jane@example.com',
      password: 'Password1!',
      rememberMe: false,
    };

    it('returns the SAME generic 401 for an unknown email and for a wrong password', async () => {
      users.findByEmail.mockResolvedValue(null);
      const unknown = await service
        .signin(dto, fakeResponse())
        .catch((e: unknown) => e);

      users.findByEmail.mockResolvedValue(fakeUser());
      const wrong = await service
        .signin({ ...dto, password: 'WrongPass1!' }, fakeResponse())
        .catch((e: unknown) => e);

      for (const error of [unknown, wrong]) {
        expect(error).toBeInstanceOf(DomainException);
        expect((error as DomainException).errorCode).toBe(
          'INVALID_CREDENTIALS',
        );
        expect((error as DomainException).getStatus()).toBe(401);
      }
      expect((unknown as DomainException).message).toBe(
        (wrong as DomainException).message,
      );
    });

    it('signs a JWT with sub/email and sets both cookies with the 1-day refresh TTL', async () => {
      users.findByEmail.mockResolvedValue(fakeUser());
      refreshTokens.issue.mockResolvedValue({
        token: 'refresh-raw',
        expiresAt: FUTURE(),
      });
      const res = fakeResponse();

      await expect(service.signin(dto, res)).resolves.toEqual({
        id: 'user-id-1',
        email: 'jane@example.com',
        name: 'Jane Doe',
      });

      expect(jwt.signAsync).toHaveBeenCalledWith(
        { sub: 'user-id-1', email: 'jane@example.com' },
        { expiresIn: 900 },
      );

      expect(res.cookie).toHaveBeenCalledTimes(2);
      const [accessName, accessValue, accessOpts] = res.cookie.mock.calls[0];
      expect(accessName).toBe('accessToken');
      expect(accessValue).toBe('signed-access-token');
      expect(accessOpts).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/api',
        maxAge: 900_000,
      });

      const [refreshName, refreshValue, refreshOpts] = res.cookie.mock.calls[1];
      expect(refreshName).toBe('refreshToken');
      expect(refreshValue).toBe('refresh-raw');
      expect(refreshOpts).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/api/auth',
        maxAge: 24 * 60 * 60 * 1000,
      });
    });

    it('uses the 30-day refresh TTL when rememberMe is true', async () => {
      users.findByEmail.mockResolvedValue(fakeUser());
      refreshTokens.issue.mockResolvedValue({
        token: 'refresh-raw',
        expiresAt: FUTURE(),
      });
      const res = fakeResponse();

      await service.signin({ ...dto, rememberMe: true }, res);

      expect(refreshTokens.issue).toHaveBeenCalledWith('user-id-1', true);
      expect(res.cookie.mock.calls[1][2]).toMatchObject({
        path: '/api/auth',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    });
  });

  describe('refresh', () => {
    function givenLiveRow(overrides: Record<string, unknown> = {}) {
      refreshTokens.findByToken.mockResolvedValue({
        _id: 'row-1',
        userId: 'user-id-1',
        rememberMe: true,
        revokedAt: null,
        expiresAt: FUTURE(),
        ...overrides,
      });
    }

    it('rotates the refresh token, inherits rememberMe and sets fresh cookies', async () => {
      givenLiveRow();
      refreshTokens.revoke.mockResolvedValue({ revokedAt: new Date() });
      refreshTokens.issue.mockResolvedValue({
        token: 'new-refresh',
        expiresAt: FUTURE(),
      });
      users.findById.mockResolvedValue(fakeUser());
      const res = fakeResponse();

      await expect(service.refresh('old-refresh', res)).resolves.toEqual({
        id: 'user-id-1',
        email: 'jane@example.com',
        name: 'Jane Doe',
      });

      expect(refreshTokens.revoke).toHaveBeenCalledWith('old-refresh');
      expect(refreshTokens.issue).toHaveBeenCalledWith('user-id-1', true);
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(res.cookie.mock.calls[1][1]).toBe('new-refresh');
    });

    it('fails 401 REFRESH_TOKEN_INVALID when no cookie / unknown token', async () => {
      await expectDomainError(
        service.refresh(undefined, fakeResponse()),
        'REFRESH_TOKEN_INVALID',
        401,
      );
      refreshTokens.findByToken.mockResolvedValue(null);
      await expectDomainError(
        service.refresh('nope', fakeResponse()),
        'REFRESH_TOKEN_INVALID',
        401,
      );
    });

    it('fails 401 REFRESH_TOKEN_EXPIRED for an expired row', async () => {
      givenLiveRow({ expiresAt: PAST() });
      await expectDomainError(
        service.refresh('old-refresh', fakeResponse()),
        'REFRESH_TOKEN_EXPIRED',
        401,
      );
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('detects reuse: revokes EVERY row of the user and fails 401 REFRESH_TOKEN_REUSED', async () => {
      givenLiveRow({ revokedAt: PAST() });
      await expectDomainError(
        service.refresh('old-refresh', fakeResponse()),
        'REFRESH_TOKEN_REUSED',
        401,
      );
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-id-1');
      expect(refreshTokens.issue).not.toHaveBeenCalled();
    });

    it('treats a lost rotation race as reuse and revokes all user tokens', async () => {
      givenLiveRow();
      refreshTokens.revoke.mockResolvedValue(null); // concurrent request already rotated it
      await expectDomainError(
        service.refresh('old-refresh', fakeResponse()),
        'REFRESH_TOKEN_REUSED',
        401,
      );
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-id-1');
    });
  });

  describe('logout', () => {
    it('revokes the row when the cookie maps to a live token and clears both cookies', async () => {
      refreshTokens.findByToken.mockResolvedValue({
        _id: 'row-1',
        userId: 'user-id-1',
        revokedAt: null,
      });
      refreshTokens.revoke.mockResolvedValue({ revokedAt: new Date() });
      const res = fakeResponse();

      await expect(service.logout('refresh-raw', res)).resolves.toBeUndefined();

      expect(refreshTokens.revoke).toHaveBeenCalledWith('refresh-raw');
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
      expect(res.clearCookie).toHaveBeenCalledWith(
        'accessToken',
        expect.objectContaining({ path: '/api' }),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({ path: '/api/auth' }),
      );
    });

    it('stays idempotent: unknown/revoked token still clears cookies, never throws', async () => {
      refreshTokens.findByToken.mockResolvedValue(null);
      const res = fakeResponse();
      await expect(service.logout('garbage', res)).resolves.toBeUndefined();
      expect(refreshTokens.revoke).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledTimes(2);

      refreshTokens.findByToken.mockResolvedValue({
        _id: 'row-1',
        userId: 'u',
        revokedAt: PAST(),
      });
      await expect(service.logout('revoked', res)).resolves.toBeUndefined();
      expect(refreshTokens.revoke).not.toHaveBeenCalled();

      await expect(service.logout(undefined, res)).resolves.toBeUndefined();
      expect(res.clearCookie).toHaveBeenCalledTimes(6);
    });
  });
});
