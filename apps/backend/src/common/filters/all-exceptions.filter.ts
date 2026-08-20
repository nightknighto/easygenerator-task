import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';
import type { Response } from 'express';
import { DomainException } from '../errors/domain.exception';

/** Fallback codes for HttpExceptions thrown by the framework itself. */
const codeByStatus: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
};

/**
 * Renders every error — Zod validation, domain errors, framework
 * HttpExceptions and unhandled exceptions — as the shared envelope
 * `{ statusCode, code, message, details? }`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ZodValidationException) {
      // nestjs-zod types getZodError() as {} — it is the ZodError instance.
      const zodError = exception.getZodError() as ZodError | undefined;
      this.send(
        response,
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Validation failed',
        zodError?.issues,
      );
      return;
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body: string | object = exception.getResponse();

      let code: string | undefined;
      let message: string;
      let details: unknown;

      if (typeof body === 'string') {
        message = body;
      } else {
        const record = body as Record<string, unknown>;
        code = typeof record['code'] === 'string' ? record['code'] : undefined;
        details = record['details'];
        if (typeof record['message'] === 'string') {
          message = record['message'];
        } else if (Array.isArray(record['message'])) {
          // e.g. framework ValidationPipe-style string arrays
          message = 'Validation failed';
          details = record['message'];
        } else {
          message = exception.message;
        }
      }

      if (exception instanceof DomainException) {
        code = exception.errorCode;
        details ??= exception.details;
      }

      this.send(
        response,
        statusCode,
        code ?? codeByStatus[statusCode] ?? 'HTTP_ERROR',
        message,
        details,
      );
      return;
    }

    this.logger.error(
      exception instanceof Error
        ? exception.stack
        : `Unhandled exception: ${String(exception)}`,
    );
    this.send(
      response,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INTERNAL_ERROR',
      'Internal server error',
    );
  }

  private send(
    response: Response,
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ): void {
    const payload: Record<string, unknown> = { statusCode, code, message };
    if (details !== undefined) payload['details'] = details;
    response.status(statusCode).json(payload);
  }
}
