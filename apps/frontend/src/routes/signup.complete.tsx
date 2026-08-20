import { createFileRoute } from '@tanstack/react-router'
import { SignUpCompletePage } from '../pages/signup-complete-page'

export const Route = createFileRoute('/signup/complete')({
  validateSearch: (search: Record<string, unknown>): { token: string } => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  component: SignUpCompletePage,
})
