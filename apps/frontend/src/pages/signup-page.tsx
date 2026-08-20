import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { SignupRequestSchema, type SignupRequest } from '@app/shared'
import { api, genericErrorMessage, getFieldErrors, isNetworkError } from '../lib/api'
import { AuthCard, Button, Panel, TextField } from '../components/ui'

export function SignUpPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupRequest>({
    resolver: zodResolver(SignupRequestSchema),
    defaultValues: { email: '' },
  })

  const onSubmit: SubmitHandler<SignupRequest> = async (values) => {
    setServerError(null)
    try {
      await api.signupRequest(values)
      setSentTo(values.email)
    } catch (error) {
      if (isNetworkError(error)) {
        setServerError(genericErrorMessage(error))
        return
      }
      // Server-side VALIDATION_ERROR — map Zod issues onto the field.
      const fieldErrors = getFieldErrors(error)
      if (fieldErrors.email) {
        setError('email', { message: fieldErrors.email })
        return
      }
      setServerError('Something went wrong. Please try again.')
    }
  }

  if (sentTo !== null) {
    return (
      <AuthCard title="Check your inbox" subtitle="We may have sent you a sign-up link.">
        <Panel tone="info" title="One more step to create your account">
          If <span className="font-medium">{sentTo}</span> can sign up, a sign-up link is on its
          way. The link expires in 1 hour and can only be used once.
        </Panel>
        <p className="mt-4 text-sm text-slate-600">
          Didn't get an email, or mistyped the address?{' '}
          <button
            type="button"
            className="font-medium text-indigo-600 hover:text-indigo-500"
            onClick={() => setSentTo(null)}
          >
            Try again
          </button>
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Enter your email and we'll send you a link to finish signing up."
      footer={
        <span>
          Already have an account?{' '}
          <Link to="/signin" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {serverError ? <Panel tone="error">{serverError}</Panel> : null}

        <TextField
          id="signup-email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <Button type="submit" pending={isSubmitting}>
          {isSubmitting ? 'Sending link…' : 'Send sign-up link'}
        </Button>

        <p className="text-center text-xs text-slate-500">
          For your security, we never confirm whether an email address is already registered.
        </p>
      </form>
    </AuthCard>
  )
}
