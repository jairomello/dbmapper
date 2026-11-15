import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '../api/projects'

export const PROJECTS_QUERY_KEY = ['projects'] as const

export const projectQueryKey = (id: string) => ['project', id] as const

export function useProjects() {
  return useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => projectsApi.list(),
  })
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectQueryKey(id),
    queryFn: () => projectsApi.get(id),
    enabled: Boolean(id),
  })
}
