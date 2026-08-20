import { createZodDto } from 'nestjs-zod/dto';
import {
  MessageResponseSchema,
  SigninRequestSchema,
  SigninResponseSchema,
  SignupCompleteRequestSchema,
  SignupCompleteResponseSchema,
  SignupRequestSchema,
  SignupVerifyRequestSchema,
  SignupVerifyResponseSchema,
} from '@app/shared';

/**
 * OpenAPI DTO wrappers around the `@app/shared` Zod schemas. `createZodDto`
 * exposes `_OPENAPI_METADATA_FACTORY()` (the hook `@nestjs/swagger`'s explorer
 * calls), which renders the schema via zod v4's `toJSONSchema` — so request
 * and response models in the Swagger document are generated from the exact
 * same definitions the `ZodValidationPipe` enforces.
 */

export class SignupRequestDto extends createZodDto(SignupRequestSchema) {}
export class SignupVerifyRequestDto extends createZodDto(
  SignupVerifyRequestSchema,
) {}
export class SignupCompleteRequestDto extends createZodDto(
  SignupCompleteRequestSchema,
) {}
export class SigninRequestDto extends createZodDto(SigninRequestSchema) {}

export class SignupVerifyResponseDto extends createZodDto(
  SignupVerifyResponseSchema,
) {}
export class SignupCompleteResponseDto extends createZodDto(
  SignupCompleteResponseSchema,
) {}
export class SigninResponseDto extends createZodDto(SigninResponseSchema) {}
export class MessageResponseDto extends createZodDto(MessageResponseSchema) {}
