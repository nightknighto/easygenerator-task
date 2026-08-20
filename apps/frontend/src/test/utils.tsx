import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter, type AnyRouter } from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

/**
 * Renders the real route tree (same files the app ships) with an in-memory
 * history, so guards, redirects and navigations run exactly as in the app.
 * Resolves once RouterProvider has committed its first route.
 */
export async function renderApp(initialPath: string): Promise<{
  router: AnyRouter
  queryClient: QueryClient
}> {
  const queryClient = createTestQueryClient()
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  // RouterProvider paints nothing until the initial route commit — wait for
  // it so tests can use synchronous queries right after renderApp.
  await waitFor(() => {
    if (container.innerHTML === '') {
      throw new Error('RouterProvider did not render its initial route')
    }
  })
  return { router, queryClient }
}
