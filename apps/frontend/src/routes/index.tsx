import { createFileRoute, redirect } from '@tanstack/react-router'
import { meQueryOptions } from '../lib/auth'
import { HomePage } from '../pages/home-page'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions)
    if (!user) {
      throw redirect({ to: '/signin', search: { redirect: location.pathname } })
    }
  },
  component: HomePage,
})
