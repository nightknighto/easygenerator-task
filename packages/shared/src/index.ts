import { z } from 'zod'

export const SHARED_PACKAGE_NAME = '@app/shared'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Field rules (task spec): email format (normalized lowercase + trim),
// name min 3 chars, password min 8 chars with letter + number + special char.
// ---------------------------------------------------------------------------

// `.meta({...})` entries only attach OpenAPI metadata (titles, descriptions,
// examples) consumed by zod's `toJSONSchema` when the backend generates the
// Swagger document — they never change parsing or the inferred TS types.

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Must be a valid email address')
  .meta({ examples: ['jane.doe@example.com'] })

export const nameSchema = z.string().trim().min(3, 'Name must be at least 3 characters')

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character')
  .meta({
    description:
      'At least 8 characters, with at least one letter, one number and one special character.',
    examples: ['Str0ng!pass'],
  })

export const tokenSchema = z.string().min(1, 'Token is required')

// ---------------------------------------------------------------------------
// Signup (3-step, email-link based)
// ---------------------------------------------------------------------------

export const SignupRequestSchema = z.object({
  email: emailSchema,
}).meta({
  title: 'Sign-up request',
  description: 'Step 1 of the email-link sign-up: the address to send the link to.',
})
export type SignupRequest = z.infer<typeof SignupRequestSchema>

export const SignupVerifyRequestSchema = z.object({
  token: tokenSchema,
}).meta({
  title: 'Sign-up verify request',
  description: 'Step 2: check a sign-up link token without consuming it.',
})
export type SignupVerifyRequest = z.infer<typeof SignupVerifyRequestSchema>

export const SignupVerifyResponseSchema = z.object({
  email: z.string().email(),
}).meta({
  title: 'Sign-up verify response',
  description: 'The email address the sign-up token belongs to.',
})
export type SignupVerifyResponse = z.infer<typeof SignupVerifyResponseSchema>

export const SignupCompleteRequestSchema = z.object({
  token: tokenSchema,
  name: nameSchema,
  password: passwordSchema,
}).meta({
  title: 'Sign-up complete request',
  description: 'Step 3: consume the sign-up token and create the account.',
})
export type SignupCompleteRequest = z.infer<typeof SignupCompleteRequestSchema>

export const SignupCompleteResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
}).meta({
  title: 'Sign-up complete response',
  description: 'The created account. Sign-up does not sign the user in (no cookies are set).',
})
export type SignupCompleteResponse = z.infer<typeof SignupCompleteResponseSchema>

// ---------------------------------------------------------------------------
// Sign-in / shared user shape
// ---------------------------------------------------------------------------

export const SigninRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().default(false),
}).meta({
  title: 'Sign-in request',
  description:
    'Credentials for signing in. On success the server sets the httpOnly `accessToken` and `refreshToken` cookies.',
})
export type SigninRequest = z.infer<typeof SigninRequestSchema>

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
}).meta({
  title: 'User',
  description: 'Public user shape returned by the auth endpoints.',
})
export type User = z.infer<typeof UserSchema>

export const SigninResponseSchema = UserSchema
export type SigninResponse = z.infer<typeof SigninResponseSchema>

export const MessageResponseSchema = z.object({
  message: z.string(),
}).meta({
  title: 'Message response',
  description:
    'Generic message body — used by sign-up step 1, which always answers the same message (anti-enumeration).',
  examples: [
    {
      message:
        'If this address can sign up, a sign-up link has been sent to it. Please check your inbox.',
    },
  ],
})
export type MessageResponse = z.infer<typeof MessageResponseSchema>

// ---------------------------------------------------------------------------
// Error envelope: { statusCode, code, message, details? }
// ---------------------------------------------------------------------------

export const ApiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
}).meta({
  title: 'API error',
  description:
    'Every non-2xx response body uses this envelope. `code` is a machine-readable string (e.g. VALIDATION_ERROR, INVALID_CREDENTIALS); for 400 VALIDATION_ERROR, `details` holds the Zod issue array.',
  examples: [
    {
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    },
  ],
})
export type ApiError = z.infer<typeof ApiErrorSchema>
