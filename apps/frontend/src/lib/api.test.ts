import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, api, getFieldErrors } from './api'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  fetchMock.mockReset()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api client', () => {
  it('returns the parsed JSON body on success', async () => {
    const user = { id: 'u1', email: 'a@example.com', name: 'Ada' }
    fetchMock.mockResolvedValue(jsonResponse(200, user))

    await expect(api.me()).resolves.toEqual(user)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    )
  })

  it('POSTs a JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { message: 'ok' }))

    await api.signin({ email: 'a@example.com', password: 'secret1!', rememberMe: false })

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@example.com', password: 'secret1!', rememberMe: false }),
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('parses the error envelope into a typed ApiClientError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, {
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      }),
    )

    const error: unknown = await api.signin({
      email: 'a@example.com',
      password: 'wrong1!',
      rememberMe: false,
    }).then(
      () => undefined,
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(ApiClientError)
    expect(error).toBeInstanceOf(Error)
    expect((error as ApiClientError).status).toBe(401)
    expect((error as ApiClientError).code).toBe('INVALID_CREDENTIALS')
    expect((error as ApiClientError).message).toBe('Invalid credentials')
  })

  it('falls back to a generic HTTP_ERROR when the error body is not the envelope', async () => {
    fetchMock.mockResolvedValue(new Response('Bad Gateway', { status: 502 }))

    const error: unknown = await api.me().then(
      () => undefined,
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).status).toBe(502)
    expect((error as ApiClientError).code).toBe('HTTP_ERROR')
  })

  it('maps a fetch rejection to a NETWORK_ERROR with status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))

    const error: unknown = await api.me().then(
      () => undefined,
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).status).toBe(0)
    expect((error as ApiClientError).code).toBe('NETWORK_ERROR')
  })

  it('resolves undefined for 204 responses (logout)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(api.logout()).resolves.toBeUndefined()
  })
})

describe('getFieldErrors', () => {
  it('maps Zod issues from details to field messages', () => {
    const error = new ApiClientError(400, 'VALIDATION_ERROR', 'Validation failed', [
      { path: ['password'], message: 'Password must contain at least one number' },
      { path: ['name'], message: 'Name must be at least 3 characters' },
    ])

    expect(getFieldErrors(error)).toEqual({
      password: 'Password must contain at least one number',
      name: 'Name must be at least 3 characters',
    })
  })

  it('keeps the first message per field and returns {} for anything else', () => {
    const withDupes = new ApiClientError(400, 'VALIDATION_ERROR', 'Validation failed', [
      { path: ['password'], message: 'first' },
      { path: ['password'], message: 'second' },
    ])
    expect(getFieldErrors(withDupes)).toEqual({ password: 'first' })

    expect(getFieldErrors(new Error('nope'))).toEqual({})
    expect(
      getFieldErrors(new ApiClientError(401, 'INVALID_CREDENTIALS', 'Invalid credentials')),
    ).toEqual({})
  })
})
