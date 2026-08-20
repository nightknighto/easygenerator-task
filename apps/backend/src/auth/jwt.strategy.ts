import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { ACCESS_TOKEN_COOKIE } from './auth.constants';

export type JwtPayload = { sub: string; email: string };
export type AuthenticatedUser = { id: string; email: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      // Custom extractor: the access token travels in the httpOnly cookie.
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null => {
          // cookie-parser types `cookies` as any — narrow it explicitly.
          const cookies = req?.cookies as
            Record<string, string | undefined> | undefined;
          return cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('ACCESS_TOKEN_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException();
    }
    return { id: payload.sub, email: payload.email };
  }
}
