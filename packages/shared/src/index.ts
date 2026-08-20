import { z } from 'zod'

export const SHARED_PACKAGE_NAME = '@app/shared'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Field rules (task spec): email format (normalized lowercase + trim),
// name min 3 chars, password min 8 chars with letter + number + special char.
// ---------------------------------------------------------------------------

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Must be a valid email address')

export const nameSchema = z.string().trim().min(3, 'Name must be at least 3 characters')

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character')

export const tokenSchema = z.string().min(1, 'Token is required')

// ---------------------------------------------------------------------------
// Signup (3-step, email-link based)
// ---------------------------------------------------------------------------

export const SignupRequestSchema = z.object({
  email: emailSchema,
})
export type SignupRequest = z.infer<typeof SignupRequestSchema>

export const SignupVerifyRequestSchema = z.object({
  token: tokenSchema,
})
export type SignupVerifyRequest = z.infer<typeof SignupVerifyRequestSchema>

export const SignupVerifyResponseSchema = z.object({
  email: z.string().email(),
})
export type SignupVerifyResponse = z.infer<typeof SignupVerifyResponseSchema>

export const SignupCompleteRequestSchema = z.object({
  token: tokenSchema,
  name: nameSchema,
  password: passwordSchema,
})
export type SignupCompleteRequest = z.infer<typeof SignupCompleteRequestSchema>

export const SignupCompleteResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
})
export type SignupCompleteResponse = z.infer<typeof SignupCompleteResponseSchema>

// ---------------------------------------------------------------------------
// Sign-in / shared user shape
// ---------------------------------------------------------------------------

export const SigninRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().default(false),
})
export type SigninRequest = z.infer<typeof SigninRequestSchema>

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
})
export type User = z.infer<typeof UserSchema>

export const SigninResponseSchema = UserSchema
export type SigninResponse = z.infer<typeof SigninResponseSchema>

// ---------------------------------------------------------------------------
// Error envelope: { statusCode, code, message, details? }
// ---------------------------------------------------------------------------

export const ApiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
})
export type ApiError = z.infer<typeof ApiErrorSchema>
