import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Body,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  SigninRequestSchema,
  SignupCompleteRequestSchema,
  SignupRequestSchema,
  SignupVerifyRequestSchema,
  type SigninRequest,
  type SigninResponse,
  type SignupCompleteRequest,
  type SignupCompleteResponse,
  type SignupRequest,
  type SignupVerifyRequest,
  type SignupVerifyResponse,
} from '@app/shared';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedUser } from './jwt.strategy';

/** Reads the path-scoped refresh cookie (cookie-parser types cookies as any). */
function readRefreshCookie(req: Request): string | undefined {
  const cookies = req?.cookies as
    Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_TOKEN_COOKIE];
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Post('signup/request')
  @HttpCode(HttpStatus.OK)
  requestSignup(
    @Body(new ZodValidationPipe(SignupRequestSchema)) dto: SignupRequest,
  ): Promise<{ message: string }> {
    return this.auth.requestSignup(dto);
  }

  @Post('signup/verify')
  @HttpCode(HttpStatus.OK)
  verifySignupToken(
    @Body(new ZodValidationPipe(SignupVerifyRequestSchema))
    dto: SignupVerifyRequest,
  ): Promise<SignupVerifyResponse> {
    return this.auth.verifySignupToken(dto);
  }

  @Post('signup/complete')
  @HttpCode(HttpStatus.CREATED)
  completeSignup(
    @Body(new ZodValidationPipe(SignupCompleteRequestSchema))
    dto: SignupCompleteRequest,
  ): Promise<SignupCompleteResponse> {
    return this.auth.completeSignup(dto);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  signin(
    @Body(new ZodValidationPipe(SigninRequestSchema)) dto: SigninRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SigninResponse> {
    return this.auth.signin(dto, res);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SigninResponse> {
    return this.auth.refresh(readRefreshCookie(req), res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(req), res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request): Promise<SigninResponse> {
    const { id } = req.user as AuthenticatedUser;
    const found = await this.users.findById(id);
    if (!found) {
      throw new UnauthorizedException('Account no longer exists.');
    }
    return { id: String(found._id), email: found.email, name: found.name };
  }
}
