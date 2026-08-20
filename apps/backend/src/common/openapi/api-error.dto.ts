import { createZodDto } from 'nestjs-zod/dto';
import { ApiErrorSchema } from '@app/shared';

/**
 * OpenAPI DTO for the shared error envelope `{ statusCode, code, message,
 * details? }`. Derived from `ApiErrorSchema` in `@app/shared` — no manual
 * duplication of the shape.
 */
export class ApiErrorDto extends createZodDto(ApiErrorSchema) {}
