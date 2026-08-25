import { QueryClient } from '@tanstack/react-query'

/**
 * Configured QueryClient for React Query.
 * - staleTime: 30 seconds (data is fresh for 30s after fetching)
 * - refetchOnWindowFocus: false (don't refetch when window regains focus)
 * - retry: 1 (retry once on failure, then give up)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
