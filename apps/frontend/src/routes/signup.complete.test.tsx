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

const verifyMock = vi.mocked(api.signupVerify)
const completeMock = vi.mocked(api.signupComplete)

beforeEach(() => {
  vi.clearAllMocks()
})

function tokenError(code: string): ApiClientError {
  return new ApiClientError(400, code, 'Signup token problem')
}

describe('/signup/complete (verification + account creation)', () => {
  it('shows the verifying state while the token is being checked', async () => {
    verifyMock.mockReturnValue(new Promise(() => {}))
    await renderApp('/signup/complete?token=tok123')

    expect(screen.getByText('Verifying your sign-up link')).toBeInTheDocument()
    expect(screen.getByText('Checking your link…')).toBeInTheDocument()
  })

  it('verifies, shows the email + requirement hints, and completes successfully', async () => {
    verifyMock.mockResolvedValue({ email: 'ada@example.com' })
    completeMock.mockResolvedValue({ id: 'u1', email: 'ada@example.com', name: 'Ada' })
    const user = userEvent.setup()
    await renderApp('/signup/complete?token=tok123')

    await screen.findByText('Finish creating your account')
    expect(screen.getByText(/ada@example\.com/)).toBeInTheDocument()

    // Live password hints derived from the shared schema are rendered.
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(screen.getByText('Password must contain at least one letter')).toBeInTheDocument()
    expect(screen.getByText('Password must contain at least one number')).toBeInTheDocument()
    expect(
      screen.getByText('Password must contain at least one special character'),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('Full name'), 'Ada Lovelace')
    await user.type(screen.getByLabelText('Password'), 'correcthorse1!')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(completeMock).toHaveBeenCalledTimes(1))
    expect(completeMock).toHaveBeenCalledWith({
      token: 'tok123',
      name: 'Ada Lovelace',
      password: 'correcthorse1!',
    })

    expect(await screen.findByText('Account created')).toBeInTheDocument()
    // Spec: after completing sign-up the user is redirected to sign-in, NOT
    // signed in automatically.
    expect(screen.getByRole('link', { name: 'Continue to sign in' })).toHaveAttribute(
      'href',
      '/signin',
    )
  })

  it('differentiates an expired token and offers the restart CTA', async () => {
    verifyMock.mockRejectedValue(tokenError('SIGNUP_TOKEN_EXPIRED'))
    await renderApp('/signup/complete?token=expired')

    expect(await screen.findByText('This sign-up link has expired')).toBeInTheDocument()
    const restart = screen.getByRole('link', { name: 'Request a new link' })
    expect(restart).toHaveAttribute('href', '/signup')
    expect(screen.queryByText('This sign-up link is not valid')).not.toBeInTheDocument()
  })

  it('differentiates a consumed token', async () => {
    verifyMock.mockRejectedValue(tokenError('SIGNUP_TOKEN_CONSUMED'))
    await renderApp('/signup/complete?token=consumed')

    expect(
      await screen.findByText('This sign-up link has already been used'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
      'href',
      '/signup',
    )
  })

  it('treats any other token failure as invalid', async () => {
    verifyMock.mockRejectedValue(tokenError('SIGNUP_TOKEN_INVALID'))
    await renderApp('/signup/complete?token=garbage')

    expect(await screen.findByText('This sign-up link is not valid')).toBeInTheDocument()
  })

  it('renders the invalid panel for a missing token without calling the API', async () => {
    await renderApp('/signup/complete')

    expect(await screen.findByText('This sign-up link is not valid')).toBeInTheDocument()
    expect(verifyMock).not.toHaveBeenCalled()
  })

  it('shows the already-registered panel with a sign-in link on 409', async () => {
    verifyMock.mockResolvedValue({ email: 'ada@example.com' })
    completeMock.mockRejectedValue(
      new ApiClientError(409, 'EMAIL_ALREADY_REGISTERED', 'Email already registered'),
    )
    const user = userEvent.setup()
    await renderApp('/signup/complete?token=tok123')

    await screen.findByText('Finish creating your account')
    await user.type(screen.getByLabelText('Full name'), 'Ada Lovelace')
    await user.type(screen.getByLabelText('Password'), 'correcthorse1!')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('This email already has an account')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/signin')
  })
})
