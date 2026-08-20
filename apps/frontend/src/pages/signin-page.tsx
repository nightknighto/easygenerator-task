import { useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { SigninRequestSchema, type SigninRequest } from '@app/shared'
import { api, ApiClientError, genericErrorMessage, isNetworkError } from '../lib/api'
import { meQueryKey } from '../lib/auth'
import { AuthCard, Button, CheckboxField, Panel, TextField } from '../components/ui'

/**
 * Only same-origin app paths are honored as post-login redirect targets —
 * never an absolute or protocol-relative URL.
 */
function isSafeAppPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}

type SignInFormValues = z.input<typeof SigninRequestSchema>

export function SignInPage() {
  const rawRedirect: string | undefined = useSearch({ from: '/signin' }).redirect
  // Defense-in-depth: never hand an absolute/protocol-relative URL to navigate.
  const redirectTo = isSafeAppPath(rawRedirect) ? rawRedirect : undefined
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues, unknown, SigninRequest>({
    resolver: zodResolver(SigninRequestSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  })

  const onSubmit: SubmitHandler<SigninRequest> = async (values) => {
    setServerError(null)
    try {
      const user = await api.signin(values)
      queryClient.setQueryData(meQueryKey, user)
      await navigate({ to: redirectTo ?? '/', replace: true })
    } catch (error) {
      // Never reveal which field was wrong — 401 gets the same generic
      // message as any other server-side failure that isn't network-related.
      if (isNetworkError(error)) {
        setServerError(genericErrorMessage(error))
      } else if (error instanceof ApiClientError) {
        setServerError('Invalid email or password.')
      } else {
        setServerError('Something went wrong. Please try again.')
      }
    }
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back. Enter your credentials to access the application."
      footer={
        <span>
          No account yet?{' '}
          <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
            Create one
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {serverError ? <Panel tone="error">{serverError}</Panel> : null}

        <TextField
          id="signin-email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <TextField
          id="signin-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <CheckboxField id="signin-remember" label="Keep me signed in" {...register('rememberMe')} />

        <Button type="submit" pending={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  )
}
