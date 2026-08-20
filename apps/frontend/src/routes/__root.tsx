import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

/** Router context: the shared QueryClient is available to every beforeLoad. */
export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <div className="min-h-screen bg-slate-100 text-slate-900 antialiased">
      <Outlet />
    </div>
  ),
})
