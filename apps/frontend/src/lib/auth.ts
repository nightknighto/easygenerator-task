import { queryOptions } from '@tanstack/react-query'
import type { User } from '@app/shared'
import { api, ApiClientError } from './api'

export const meQueryKey = ['me'] as const

/**
 * Resolves the signed-in user, transparently refreshing an expired access
 * token exactly once:
 *
 *   GET /me → 401 → POST /refresh (once) → GET /me (once) → user
 *
 * Any failure along the way resolves to `null` (signed out) rather than
 * throwing — an auth probe failing should never crash the UI.
 */
export async function fetchMe(): Promise<User | null> {
  try {
    return await api.me()
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.status !== 401) {
      return null
    }
  }

  try {
    await api.refresh()
  } catch {
    return null
  }

  try {
    return await api.me()
  } catch {
    return null
  }
}

export const meQueryOptions = queryOptions({
  queryKey: meQueryKey,
  queryFn: fetchMe,
  staleTime: 5 * 60 * 1000,
  retry: false,
  refetchOnWindowFocus: false,
})
