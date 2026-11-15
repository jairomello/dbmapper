import { useQuery } from '@tanstack/react-query'
import { authApi } from '../api/auth'

export const SESSION_QUERY_KEY = ['session'] as const

export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => authApi.me(),
    retry: false,
  })
}
