import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, api } from './api'
import { fetchMe } from './auth'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    api: {
      signupRequest: vi.fn(),
      signupVerify: vi.fn(),
      signupComplete: vi.fn(),
      signin: vi.fn(),
      refresh: vi.fn(),
      logout: vi.fn(),
      me: vi.fn(),
    },
  }
})

const meMock = vi.mocked(api.me)
const refreshMock = vi.mocked(api.refresh)

const user = { id: 'u1', email: 'a@example.com', name: 'Ada Lovelace' }
const refreshedUser = { id: 'u1', email: 'a@example.com', name: 'Ada Lovelace' }

function unauthenticated(code = 'UNAUTHENTICATED'): ApiClientError {
  return new ApiClientError(401, code, 'Unauthorized')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchMe (me query with single refresh)', () => {
  it('returns the user when the access token is valid', async () => {
    meMock.mockResolvedValue(user)

    await expect(fetchMe()).resolves.toEqual(user)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('refreshes once and retries me once when me returns 401', async () => {
    meMock.mockRejectedValueOnce(unauthenticated()).mockResolvedValueOnce(user)
    meMock.mockRejectedValue(unauthenticated()) // any further me() must NOT happen
    refreshMock.mockResolvedValue(refreshedUser)

    await expect(fetchMe()).resolves.toEqual(user)
    expect(meMock).toHaveBeenCalledTimes(2)
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('resolves null when the refresh itself fails', async () => {
    meMock.mockRejectedValue(unauthenticated())
    refreshMock.mockRejectedValue(new ApiClientError(401, 'REFRESH_TOKEN_INVALID', 'Invalid'))

    await expect(fetchMe()).resolves.toBeNull()
    expect(meMock).toHaveBeenCalledTimes(1)
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('resolves null when me still 401s after a successful refresh', async () => {
    meMock.mockRejectedValue(unauthenticated())
    refreshMock.mockResolvedValue(refreshedUser)

    await expect(fetchMe()).resolves.toBeNull()
    expect(meMock).toHaveBeenCalledTimes(2)
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('resolves null (without refreshing) on network-level failures', async () => {
    meMock.mockRejectedValue(new ApiClientError(0, 'NETWORK_ERROR', 'unreachable'))

    await expect(fetchMe()).resolves.toBeNull()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
