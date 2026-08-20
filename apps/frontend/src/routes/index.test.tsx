import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, ApiClientError } from '../lib/api'
import { renderApp } from '../test/utils'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
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
const logoutMock = vi.mocked(api.logout)

const user = { id: 'u1', email: 'ada@example.com', name: 'Ada Lovelace' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/ (protected application page)', () => {
  it('renders the welcome message with the signed-in user', async () => {
    meMock.mockResolvedValue(user)
    await renderApp('/')

    expect(await screen.findByText('Welcome to the application.')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText(/ada@example\.com/)).toBeInTheDocument()
  })

  it('bounces to /signin when unauthenticated (refresh dead)', async () => {
    meMock.mockRejectedValue(new ApiClientError(401, 'UNAUTHENTICATED', 'Unauthorized'))
    refreshMock.mockRejectedValue(
      new ApiClientError(401, 'REFRESH_TOKEN_INVALID', 'Invalid refresh token'),
    )
    const { router } = await renderApp('/')

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/signin'))
    expect(screen.queryByText('Welcome to the application.')).not.toBeInTheDocument()
    // The guard preserved the original target in the redirect param.
    expect(router.state.location.search).toMatchObject({ redirect: '/' })
  })

  it('logs out: calls the API, clears the session and navigates to /signin', async () => {
    meMock.mockResolvedValue(user)
    logoutMock.mockResolvedValue(undefined)
    const userEventInstance = userEvent.setup()
    const { router, queryClient } = await renderApp('/')

    await screen.findByText('Welcome to the application.')
    await userEventInstance.click(screen.getByRole('button', { name: 'Log out' }))

    await vi.waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/signin'))
    expect(queryClient.getQueryData(['me'])).toBeUndefined()
  })
})
