import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { meQueryOptions } from '../lib/auth'
import { api } from '../lib/api'
import { Button, Panel, Spinner } from '../components/ui'

export function HomePage() {
  const { data: user, isPending } = useQuery(meQueryOptions)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const logout = useMutation({
    mutationFn: () => api.logout(),
    // Whether or not the server call succeeded, drop the local session —
    // the cookies are cleared server-side on success and the cache clear
    // makes the guard bounce any follow-up navigation to /signin.
    onSettled: async () => {
      queryClient.clear()
      await navigate({ to: '/signin' })
    },
  })

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-4">
      <div className="w-full rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        {isPending || !user ? (
          <div className="flex items-center justify-center gap-2 text-slate-500">
            <Spinner />
            <span className="text-sm">Loading…</span>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
              Easygenerator
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Welcome to the application.
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              You are signed in as <span className="font-medium text-slate-900">{user.name}</span> (
              {user.email}).
            </p>
            <div className="mt-6 border-t border-slate-100 pt-6">
              {logout.isError ? (
                <div className="mb-4">
                  <Panel tone="error">
                    Something went wrong while signing out. You have been signed out locally.
                  </Panel>
                </div>
              ) : null}
              <div className="flex justify-end">
                <Button
                  type="button"
                  pending={logout.isPending}
                  onClick={() => logout.mutate()}
                  className="w-auto px-4"
                >
                  Log out
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
