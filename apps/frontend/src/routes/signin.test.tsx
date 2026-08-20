import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
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

const signinMock = vi.mocked(api.signin)
const meMock = vi.mocked(api.me)

const user = { id: 'u1', email: 'ada@example.com', name: 'Ada Lovelace' }

beforeEach(() => {
  vi.clearAllMocks()
})

async function fillAndSubmit(userEventInstance: ReturnType<typeof userEvent.setup>) {
  await userEventInstance.type(screen.getByLabelText('Email'), 'ada@example.com')
  await userEventInstance.type(screen.getByLabelText('Password'), 'correcthorse1!')
  await userEventInstance.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('/signin', () => {
  it('validates both fields and does not call the API on empty submit', async () => {
    const userEventInstance = userEvent.setup()
    await renderApp('/signin')

    await userEventInstance.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Must be a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(signinMock).not.toHaveBeenCalled()
  })

  it('defaults rememberMe to false and sends it with the payload', async () => {
    signinMock.mockResolvedValue(user)
    const userEventInstance = userEvent.setup()
    await renderApp('/signin')

    expect(screen.getByLabelText('Keep me signed in')).not.toBeChecked()
    await fillAndSubmit(userEventInstance)

    await waitFor(() => expect(signinMock).toHaveBeenCalledTimes(1))
    expect(signinMock).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'correcthorse1!',
      rememberMe: false,
    })
  })

  it('shows a generic banner and stays on the page on 401', async () => {
    signinMock.mockRejectedValue(
      new ApiClientError(401, 'INVALID_CREDENTIALS', 'Invalid credentials'),
    )
    const { router } = await renderApp('/signin')

    await fillAndSubmit(userEvent.setup())

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument()
    // The generic banner must not reveal which field was wrong.
    expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/signin')
  })

  it('caches me and navigates to / on success', async () => {
    signinMock.mockResolvedValue(user)
    const { router, queryClient } = await renderApp('/signin')

    await fillAndSubmit(userEvent.setup())

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(queryClient.getQueryData(['me'])).toEqual(user)
    expect(meMock).not.toHaveBeenCalled()
  })

  it('honors the ?redirect= search parameter on success', async () => {
    signinMock.mockResolvedValue(user)
    const { router } = await renderApp('/signin?redirect=%2Fsignup')

    await fillAndSubmit(userEvent.setup())

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/signup'))
  })

  it('ignores non-relative redirect targets', async () => {
    signinMock.mockResolvedValue(user)
    const { router } = await renderApp('/signin?redirect=https%3A%2F%2Fevil.example')

    await fillAndSubmit(userEvent.setup())

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})
