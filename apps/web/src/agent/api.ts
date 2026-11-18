import { jsonRequest, request } from '../api/client'

export type AgentJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type AgentJobScope = 'project' | 'table'
export type AgentSuggestionStatus = 'pending' | 'applied' | 'rejected'
export type AgentSuggestionItemType = 'table' | 'column'

export interface AgentJob {
  id: string
  projectId: string
  scope: AgentJobScope
  tableId: string | null
  status: AgentJobStatus
  attempts: number
  requestedBy: string
  error: string | null
  stats: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AgentSuggestionTarget {
  type?: AgentSuggestionItemType
  name?: string
  columnType?: string
  primaryKey?: boolean
  foreignKey?: boolean
}

export interface AgentSuggestionTable {
  id?: string
  name?: string
  description?: string
  businessTerms?: string[]
}

export interface AgentSuggestionItem {
  type?: AgentSuggestionItemType
  id?: string
  name?: string
}

export interface AgentSuggestionContext {
  table?: AgentSuggestionTable
  item?: AgentSuggestionItem
  targets?: AgentSuggestionTarget[]
  describedColumns?: Array<{ name?: string; type?: string; description?: string }>
  foreignKeys?: Array<{ column?: string; targetTable?: string }>
}

export interface AgentSuggestion {
  id: string
  projectId: string
  jobId: string
  itemType: AgentSuggestionItemType
  itemId: string
  tableId: string | null
  suggestedDescription: string
  context: AgentSuggestionContext
  status: AgentSuggestionStatus
  requestedBy: string
  decidedBy: string | null
  decidedAt: string | null
  createdAt: string
  updatedAt: string
}

export type GenerateSuggestionsInput = { scope: 'project' } | { scope: 'table'; tableId: string }

export interface SuggestionListResult {
  suggestions: AgentSuggestion[]
}

export interface AgentJobResult {
  job: AgentJob
}

export interface AgentSuggestionResult {
  suggestion: AgentSuggestion
}

export interface ApplySuggestionsResult {
  applied: string[]
  skipped: string[]
}

export interface RejectSuggestionsResult {
  rejected: string[]
  skipped: string[]
}

function agentPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/agent`
}

export const agentApi = {
  listPending(projectId: string): Promise<SuggestionListResult> {
    return request<SuggestionListResult>(`${agentPath(projectId)}/suggestions?status=pending`)
  },
  getJob(projectId: string, jobId: string): Promise<AgentJobResult> {
    return request<AgentJobResult>(`${agentPath(projectId)}/jobs/${encodeURIComponent(jobId)}`)
  },
  generate(projectId: string, input: GenerateSuggestionsInput): Promise<AgentJobResult> {
    return jsonRequest<AgentJobResult>(`${agentPath(projectId)}/suggestions`, 'POST', input)
  },
  edit(projectId: string, suggestionId: string, text: string): Promise<AgentSuggestionResult> {
    return jsonRequest<AgentSuggestionResult>(
      `${agentPath(projectId)}/suggestions/${encodeURIComponent(suggestionId)}`,
      'PATCH',
      { text },
    )
  },
  apply(projectId: string, ids: string[]): Promise<ApplySuggestionsResult> {
    return jsonRequest<ApplySuggestionsResult>(`${agentPath(projectId)}/suggestions/apply`, 'POST', { ids })
  },
  reject(projectId: string, ids: string[]): Promise<RejectSuggestionsResult> {
    return jsonRequest<RejectSuggestionsResult>(`${agentPath(projectId)}/suggestions/reject`, 'POST', { ids })
  },
}
