import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectQueryKey } from '../projects/queries'
import { agentApi, type GenerateSuggestionsInput } from './api'

export const AGENT_POLL_INTERVAL_MS = 2000

export const agentSuggestionsQueryKey = (projectId: string) => ['agent', 'suggestions', projectId] as const

export const agentJobQueryKey = (projectId: string, jobId: string) => ['agent', 'job', projectId, jobId] as const

export function invalidateAgentResults(queryClient: QueryClient, projectId: string): void {
  queryClient.invalidateQueries({ queryKey: agentSuggestionsQueryKey(projectId) })
  queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) })
}

export function usePendingSuggestions(projectId: string) {
  return useQuery({
    queryKey: agentSuggestionsQueryKey(projectId),
    queryFn: () => agentApi.listPending(projectId),
    enabled: Boolean(projectId),
  })
}

export function useAgentJob(projectId: string, jobId: string | null) {
  return useQuery({
    queryKey: agentJobQueryKey(projectId, jobId ?? ''),
    queryFn: () => agentApi.getJob(projectId, jobId ?? ''),
    enabled: Boolean(projectId && jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.job.status
      return status === 'queued' || status === 'running' ? AGENT_POLL_INTERVAL_MS : false
    },
  })
}

export function useGenerateSuggestions(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: GenerateSuggestionsInput) => agentApi.generate(projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentSuggestionsQueryKey(projectId) })
    },
  })
}

export function useEditSuggestion(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; text: string }) => agentApi.edit(projectId, input.id, input.text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentSuggestionsQueryKey(projectId) })
    },
  })
}

export function useApplySuggestions(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) => agentApi.apply(projectId, ids),
    onSuccess: () => {
      invalidateAgentResults(queryClient, projectId)
    },
  })
}

export function useRejectSuggestions(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) => agentApi.reject(projectId, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentSuggestionsQueryKey(projectId) })
    },
  })
}
