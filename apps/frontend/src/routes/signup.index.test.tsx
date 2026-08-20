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

const signupRequestMock = vi.mocked(api.signupRequest)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/signup (email-link request)', () => {
  it('validates the email and does not call the API on empty submit', async () => {
    const user = userEvent.setup()
    await renderApp('/signup')

    await user.click(screen.getByRole('button', { name: 'Send sign-up link' }))

    expect(await screen.findByText('Must be a valid email address')).toBeInTheDocument()
    expect(signupRequestMock).not.toHaveBeenCalled()
  })

  it('submits the normalized email and shows the generic success panel', async () => {
    signupRequestMock.mockResolvedValue({ message: 'ok' })
    const user = userEvent.setup()
    await renderApp('/signup')

    await user.type(screen.getByLabelText('Email'), '  Ada@EXAMPLE.com  ')
    await user.click(screen.getByRole('button', { name: 'Send sign-up link' }))

    await waitFor(() => expect(signupRequestMock).toHaveBeenCalledTimes(1))
    expect(signupRequestMock).toHaveBeenCalledWith({ email: 'ada@example.com' })

    expect(await screen.findByText('Check your inbox')).toBeInTheDocument()
    expect(screen.getByText(/ada@example\.com/)).toBeInTheDocument()
    // Generic anti-enumeration copy + the 1-hour expiry must both be present.
    expect(screen.getByText(/can sign up/i)).toBeInTheDocument()
    expect(screen.getByText(/expires in 1 hour/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send sign-up link' })).not.toBeInTheDocument()
  })

  it('shows a network error banner and keeps the form when the request fails', async () => {
    signupRequestMock.mockRejectedValue(
      new ApiClientError(0, 'NETWORK_ERROR', 'Could not reach the server.'),
    )
    const user = userEvent.setup()
    await renderApp('/signup')

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: 'Send sign-up link' }))

    expect(
      await screen.findByText(/Could not reach the server\. Check your connection/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send sign-up link' })).toBeInTheDocument()
  })
})
