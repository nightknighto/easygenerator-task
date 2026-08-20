import { createFileRoute } from '@tanstack/react-router'
import { SignInPage } from '../pages/signin-page'

export const Route = createFileRoute('/signin')({
  // Validates/typses the ?redirect= param; the page re-checks the value
  // before navigating (validateSearch merges over raw search and cannot
  // strip unknown keys).
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const value = search.redirect
    if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
      return { redirect: value }
    }
    return {}
  },
  component: SignInPage,
})
