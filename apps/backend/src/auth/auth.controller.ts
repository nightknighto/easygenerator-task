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
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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
import {
  MessageResponseDto,
  SigninRequestDto,
  SigninResponseDto,
  SignupCompleteRequestDto,
  SignupCompleteResponseDto,
  SignupRequestDto,
  SignupVerifyRequestDto,
  SignupVerifyResponseDto,
} from './auth.dto';
import { ApiErrorDto } from '../common/openapi/api-error.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedUser } from './jwt.strategy';

/** Reads the path-scoped refresh cookie (cookie-parser types cookies as any). */
function readRefreshCookie(req: Request): string | undefined {
  const cookies = req?.cookies as
    Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_TOKEN_COOKIE];
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Post('signup/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign-up step 1 — request an email link',
    description:
      'Sends a single-use sign-up link (1 h TTL) to the address if it can sign up. ' +
      'Registered addresses silently receive nothing — the response is identical either way.',
  })
  @ApiBody({ type: SignupRequestDto })
  @ApiOkResponse({
    type: MessageResponseDto,
    description:
      'Generic confirmation. Identical whether or not an email was sent.',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'VALIDATION_ERROR — the email is not a valid address.',
  })
  requestSignup(
    @Body(new ZodValidationPipe(SignupRequestSchema)) dto: SignupRequest,
  ): Promise<{ message: string }> {
    return this.auth.requestSignup(dto);
  }

  @Post('signup/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign-up step 2 — verify the link token',
    description:
      'Checks the token from the email link and returns the email it belongs to, ' +
      'without consuming it. Called by the completion page on load.',
  })
  @ApiBody({ type: SignupVerifyRequestDto })
  @ApiOkResponse({
    type: SignupVerifyResponseDto,
    description: 'The email address the token was issued for.',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description:
      'SIGNUP_TOKEN_INVALID / SIGNUP_TOKEN_EXPIRED / SIGNUP_TOKEN_CONSUMED, or VALIDATION_ERROR.',
  })
  verifySignupToken(
    @Body(new ZodValidationPipe(SignupVerifyRequestSchema))
    dto: SignupVerifyRequest,
  ): Promise<SignupVerifyResponse> {
    return this.auth.verifySignupToken(dto);
  }

  @Post('signup/complete')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Sign-up step 3 — create the account',
    description:
      'Consumes the token and creates the user (bcryptjs-hashed password). ' +
      'Does not sign the user in — no cookies are set; the client redirects to sign-in.',
  })
  @ApiBody({ type: SignupCompleteRequestDto })
  @ApiCreatedResponse({
    type: SignupCompleteResponseDto,
    description: 'The created account.',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description:
      'SIGNUP_TOKEN_* codes or VALIDATION_ERROR (name min 3; password min 8 with letter, number, special char).',
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description:
      'EMAIL_ALREADY_REGISTERED — the address was registered between request and completion.',
  })
  completeSignup(
    @Body(new ZodValidationPipe(SignupCompleteRequestSchema))
    dto: SignupCompleteRequest,
  ): Promise<SignupCompleteResponse> {
    return this.auth.completeSignup(dto);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Validates credentials and sets the httpOnly `accessToken` (15 min, path /api) and ' +
      '`refreshToken` (30 d with rememberMe, else 1 d; path /api/auth) cookies. ' +
      'Unknown email and wrong password return the same generic 401.',
  })
  @ApiBody({ type: SigninRequestDto })
  @ApiOkResponse({
    type: SigninResponseDto,
    description: 'The signed-in user. Auth cookies are set on this response.',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'VALIDATION_ERROR.',
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description:
      'INVALID_CREDENTIALS — identical for unknown email and wrong password.',
  })
  signin(
    @Body(new ZodValidationPipe(SigninRequestSchema)) dto: SigninRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SigninResponse> {
    return this.auth.signin(dto, res);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh the session',
    description:
      'Reads the path-scoped refreshToken cookie, rotates it (revokes the presented row, ' +
      'issues a new one inheriting rememberMe) and sets fresh cookies. ' +
      'Replaying a revoked token revokes every session of that user.',
  })
  @ApiOkResponse({
    type: SigninResponseDto,
    description: 'The user; new access + refresh cookies are set.',
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description:
      'REFRESH_TOKEN_INVALID / REFRESH_TOKEN_EXPIRED / REFRESH_TOKEN_REUSED.',
  })
  refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SigninResponse> {
    return this.auth.refresh(readRefreshCookie(req), res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Revokes the refresh-token row when the cookie maps to a live session, ' +
      'always clears both cookies. Idempotent.',
  })
  @ApiNoContentResponse({ description: 'Cookies cleared; no body.' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(req), res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Current user (protected)',
    description:
      'Requires the httpOnly accessToken cookie set by sign-in/refresh — ' +
      'call from a signed-in browser session, not via Swagger UI.',
  })
  @ApiOkResponse({
    type: SigninResponseDto,
    description: 'The authenticated user.',
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description: 'UNAUTHENTICATED — missing/expired access token.',
  })
  async me(@Req() req: Request): Promise<SigninResponse> {
    const { id } = req.user as AuthenticatedUser;
    const found = await this.users.findById(id);
    if (!found) {
      throw new UnauthorizedException('Account no longer exists.');
    }
    return { id: String(found._id), email: found.email, name: found.name };
  }
}
