import { useMemo, useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm, useWatch, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { passwordSchema, SignupCompleteRequestSchema, type SignupCompleteRequest } from '@app/shared'
import { api, ApiClientError, genericErrorMessage, getFieldErrors, isNetworkError } from '../lib/api'
import { AuthCard, Button, Panel, Spinner, TextField } from '../components/ui'

/**
 * Live requirement hints, derived from the shared `passwordSchema` itself:
 * the empty string fails every rule, so its issues enumerate all
 * requirement messages; a candidate value then tells us which are unmet.
 */
function usePasswordRequirements(value: string): Array<{ message: string; met: boolean }> {
  return useMemo(() => {
    const allMessages = passwordSchema.safeParse('').error?.issues.map((issue) => issue.message) ?? []
    const unmet = new Set(
      passwordSchema.safeParse(value).error?.issues.map((issue) => issue.message) ?? [],
    )
    return allMessages.map((message) => ({ message, met: !unmet.has(message) }))
  }, [value])
}

function TokenErrorPanel({ code }: { code: string }) {
  const copy =
    code === 'SIGNUP_TOKEN_EXPIRED'
      ? {
          title: 'This sign-up link has expired',
          body: 'Sign-up links are valid for 1 hour. Request a new link to continue.',
        }
      : code === 'SIGNUP_TOKEN_CONSUMED'
        ? {
            title: 'This sign-up link has already been used',
            body: 'Each sign-up link can only be used once. If you already completed sign-up, try signing in instead.',
          }
        : {
            title: 'This sign-up link is not valid',
            body: 'The link may be incomplete, or it was replaced when a newer sign-up email was requested.',
          }

  return (
    <Panel tone="error" title={copy.title}>
      <p>{copy.body}</p>
      <div className="mt-3 flex flex-wrap gap-4">
        <Link
          to="/signup"
          className="font-semibold text-red-700 underline underline-offset-2 hover:text-red-800"
        >
          Request a new link
        </Link>
        <Link to="/signin" className="font-semibold text-red-700 underline underline-offset-2 hover:text-red-800">
          Go to sign in
        </Link>
      </div>
    </Panel>
  )
}

type CompleteFormValues = Pick<SignupCompleteRequest, 'name' | 'password'>

function SignUpCompleteForm({ token, email }: { token: string; email: string }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CompleteFormValues>({
    resolver: zodResolver(SignupCompleteRequestSchema.pick({ name: true, password: true })),
    defaultValues: { name: '', password: '' },
    mode: 'onChange',
  })

  // useWatch (not watch) so the component stays React Compiler-friendly.
  const password = useWatch({ control, name: 'password' })
  const requirements = usePasswordRequirements(password ?? '')

  const complete = useMutation({
    mutationFn: (values: CompleteFormValues) => api.signupComplete({ token, ...values }),
  })

  const onSubmit: SubmitHandler<CompleteFormValues> = async (values) => {
    setServerError(null)
    setConflict(false)
    try {
      await complete.mutateAsync(values)
    } catch (error) {
      if (isNetworkError(error)) {
        setServerError(genericErrorMessage(error))
        return
      }
      if (error instanceof ApiClientError && error.code === 'EMAIL_ALREADY_REGISTERED') {
        setConflict(true)
        return
      }
      // VALIDATION_ERROR — map Zod issues onto the fields.
      const fieldErrors = getFieldErrors(error)
      if (fieldErrors.name || fieldErrors.password) {
        if (fieldErrors.name) setError('name', { message: fieldErrors.name })
        if (fieldErrors.password) setError('password', { message: fieldErrors.password })
        return
      }
      setServerError('Something went wrong. Please try again.')
    }
  }

  if (complete.isSuccess) {
    return (
      <AuthCard title="Your account is ready">
        <Panel tone="success" title="Account created">
          <span className="font-medium">{email}</span> can now sign in to the application.
        </Panel>
        <div className="mt-6">
          <Link to="/signin">
            <Button type="button">Continue to sign in</Button>
          </Link>
        </div>
      </AuthCard>
    )
  }

  if (conflict) {
    return (
      <AuthCard title="Email already registered">
        <Panel tone="error" title="This email already has an account">
          An account for <span className="font-medium">{email}</span> was already registered, so
          this sign-up could not be completed. Try signing in instead, or request a new link with a
          different email address.
        </Panel>
        <div className="mt-6">
          <Link to="/signin">
            <Button type="button">Go to sign in</Button>
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Finish creating your account"
      subtitle={`Email verified: ${email}`}
      footer={
        <span>
          Wrong email address?{' '}
          <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
            Start over
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {serverError ? <Panel tone="error">{serverError}</Panel> : null}

        <TextField
          id="complete-name"
          label="Full name"
          autoComplete="name"
          placeholder="Ada Lovelace"
          error={errors.name?.message}
          hint="At least 3 characters."
          {...register('name')}
        />

        <TextField
          id="complete-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <ul className="space-y-1.5" aria-label="Password requirements">
          {requirements.map((requirement) => (
            <li
              key={requirement.message}
              className={`flex items-center gap-2 text-sm ${
                requirement.met ? 'text-emerald-600' : 'text-slate-500'
              }`}
            >
              {requirement.met ? <CheckIcon /> : <DotIcon />}
              {requirement.message}
            </li>
          ))}
        </ul>

        <Button type="submit" pending={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  )
}

export function SignUpCompletePage() {
  const { token } = useSearch({ from: '/signup/complete' })

  const verifyQuery = useQuery({
    queryKey: ['signup-verify', token],
    queryFn: () => api.signupVerify(token),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  if (token.length === 0) {
    return (
      <AuthCard title="Sign-up link problem">
        <TokenErrorPanel code="SIGNUP_TOKEN_INVALID" />
      </AuthCard>
    )
  }

  if (verifyQuery.isPending) {
    return (
      <AuthCard title="Verifying your sign-up link">
        <div className="flex items-center justify-center gap-2 py-4 text-slate-500">
          <Spinner />
          <span className="text-sm">Checking your link…</span>
        </div>
      </AuthCard>
    )
  }

  if (verifyQuery.isError) {
    const code =
      verifyQuery.error instanceof ApiClientError ? verifyQuery.error.code : 'SIGNUP_TOKEN_INVALID'
    return (
      <AuthCard title="Sign-up link problem">
        <TokenErrorPanel code={code} />
      </AuthCard>
    )
  }

  return <SignUpCompleteForm token={token} email={verifyQuery.data.email} />
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-4 shrink-0" aria-hidden="true">
      <circle cx="8" cy="8" r="7" className="fill-emerald-100" />
      <path
        d="m5 8.5 2 2 4-4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DotIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-4 shrink-0" aria-hidden="true">
      <circle cx="8" cy="8" r="7" className="fill-slate-200" />
      <circle cx="8" cy="8" r="2" className="fill-slate-400" />
    </svg>
  )
}
