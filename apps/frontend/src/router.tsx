import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

/**
 * App-wide TanStack Query defaults: auth endpoints have typed error handling
 * and refresh logic of their own, so automatic retries are off (retrying a
 * 401 blindly would defeat the single-refresh flow).
 */
export function createQueryClientDefaults() {
  return {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
    },
    mutations: {
      retry: false,
    },
  }
}

export const queryClient = new QueryClient({ defaultOptions: createQueryClientDefaults() })

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
