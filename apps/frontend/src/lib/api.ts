import {
  ApiErrorSchema,
  type SignupCompleteRequest,
  type SignupCompleteResponse,
  type SignupRequest,
  type SignupVerifyResponse,
  type SigninRequest,
  type User,
} from '@app/shared'

/**
 * Typed error thrown by the API client for every non-2xx response (and for
 * network-level failures). Carries the shared error envelope's `code` and
 * `details` (Zod issue list on 400 VALIDATION_ERROR) so callers can branch
 * on domain codes.
 */
export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** Network-level failure (server unreachable, offline, DNS, ...). */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 0
}

/** Human-friendly copy for anything that is not a known domain error. */
export function genericErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  if (error instanceof ApiClientError) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

async function toApiClientError(response: Response): Promise<ApiClientError> {
  let envelope: unknown
  try {
    envelope = await response.json()
  } catch {
    // Non-JSON body (proxy error page, empty 500, ...) — fall through.
  }
  const parsed = ApiErrorSchema.safeParse(envelope)
  if (parsed.success) {
    return new ApiClientError(
      parsed.data.statusCode,
      parsed.data.code,
      parsed.data.message,
      parsed.data.details,
    )
  }
  return new ApiClientError(response.status, 'HTTP_ERROR', 'Something went wrong. Please try again.')
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  } catch (cause) {
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
      { cause },
    )
  }

  if (!response.ok) {
    throw await toApiClientError(response)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
}

/**
 * Extracts Zod field issues from an ApiClientError's `details`
 * (400 VALIDATION_ERROR) into a `{ fieldName: message }` map, ready for
 * react-hook-form's `setError(name, { message })`.
 */
export function getFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiClientError) || !Array.isArray(error.details)) {
    return {}
  }
  const result: Record<string, string> = {}
  for (const issue of error.details) {
    if (issue === null || typeof issue !== 'object') continue
    const { path, message } = issue as { path?: unknown; message?: unknown }
    if (!Array.isArray(path) || path.length === 0 || typeof message !== 'string') continue
    const field = String(path[0])
    if (!(field in result)) {
      result[field] = message
    }
  }
  return result
}

/** Thin typed wrapper around the backend's auth endpoints (all under /api). */
export const api = {
  signupRequest: (body: SignupRequest) => post<{ message: string }>('/api/auth/signup/request', body),
  signupVerify: (token: string) => post<SignupVerifyResponse>('/api/auth/signup/verify', { token }),
  signupComplete: (body: SignupCompleteRequest) =>
    post<SignupCompleteResponse>('/api/auth/signup/complete', body),
  signin: (body: SigninRequest) => post<User>('/api/auth/signin', body),
  refresh: () => post<User>('/api/auth/refresh'),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  me: () => request<User>('/api/auth/me'),
}
