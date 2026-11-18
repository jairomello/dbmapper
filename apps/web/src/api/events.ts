import { request } from './client'
import type { AuditEvent, EventListFilters } from './types'

function queryString(filters: EventListFilters): string {
  const params = new URLSearchParams()
  if (filters.action) params.set('action', filters.action)
  if (filters.projectId) params.set('projectId', filters.projectId)
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const eventsApi = {
  list(filters: EventListFilters = {}): Promise<{ events: AuditEvent[] }> {
    return request<{ events: AuditEvent[] }>(`/api/events${queryString(filters)}`)
  },
}
