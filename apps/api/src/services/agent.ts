import { buildAgentContext } from '../agent/context'
import type { ModelProvider } from '../agent/provider'
import { ApiError } from '../errors'
import type {
  AgentJobRecord,
  AgentJobScope,
  AiSuggestionRecord,
  Persistence,
  SuggestionDecisionResult,
} from '../persistence/ports'

export const AGENT_EVENT_ACTIONS = {
  generateRequested: 'agent.generate_requested',
  suggestionsApplied: 'agent.suggestions_applied',
  suggestionsEdited: 'agent.suggestions_edited',
  suggestionsRejected: 'agent.suggestions_rejected',
} as const

export const LLM_NOT_CONFIGURED_MESSAGE =
  'O provider de LLM não está configurado. Defina OPENAI_API_KEY ou OPENROUTER_API_KEY.'

function notFoundProject(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')
}

function conflict(): ApiError {
  return new ApiError(409, 'SUGGESTION_CONFLICT', 'A sugestão não está mais pendente.')
}

function assertProject(persistence: Persistence, projectId: string): void {
  if (!persistence.projects.get(projectId)) throw notFoundProject()
}

export interface GenerationInput {
  persistence: Persistence
  provider: ModelProvider | null
  projectId: string
  scope: AgentJobScope
  tableId?: string | null
  actorUserId: string
  now?: string
}

export function createGenerationJob(input: GenerationInput): AgentJobRecord {
  if (!input.provider) {
    throw new ApiError(503, 'LLM_NOT_CONFIGURED', LLM_NOT_CONFIGURED_MESSAGE)
  }

  const aggregate = input.persistence.projects.get(input.projectId)
  if (!aggregate) throw notFoundProject()

  const tableId = input.scope === 'table' ? (input.tableId ?? null) : null
  const context = buildAgentContext(aggregate, input.scope, tableId)
  if (!context) throw new ApiError(404, 'NOT_FOUND', 'Tabela não encontrada.')

  const now = input.now ?? new Date().toISOString()
  const jobId = crypto.randomUUID()

  return input.persistence.agent.jobs.create(
    {
      id: jobId,
      projectId: input.projectId,
      scope: input.scope,
      tableId,
      requestedBy: input.actorUserId,
      stats: {
        targets: context.targets.length,
        created: 0,
        skipped: 0,
        tables: context.tables.length,
        tablesProcessed: 0,
      },
    },
    {
      now,
      audit: {
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        action: AGENT_EVENT_ACTIONS.generateRequested,
        subjectType: 'agent_job',
        subjectId: jobId,
        payload: {
          scope: input.scope,
          tableId,
          targets: context.targets.length,
        },
      },
    },
  )
}

export interface EditSuggestionInput {
  persistence: Persistence
  projectId: string
  suggestionId: string
  text: string
  actorUserId: string
  now?: string
}

export function editSuggestion(input: EditSuggestionInput): AiSuggestionRecord {
  const suggestion = input.persistence.agent.suggestions.get(input.suggestionId)
  if (!suggestion || suggestion.projectId !== input.projectId) {
    throw new ApiError(404, 'NOT_FOUND', 'Sugestão não encontrada.')
  }

  const now = input.now ?? new Date().toISOString()
  const updated = input.persistence.agent.suggestions.editPending(
    input.projectId,
    input.suggestionId,
    input.text,
    input.actorUserId,
    now,
    {
      projectId: input.projectId,
      action: AGENT_EVENT_ACTIONS.suggestionsEdited,
      subjectType: 'ai_suggestion',
      subjectId: input.suggestionId,
      payload: { itemType: suggestion.itemType, itemId: suggestion.itemId },
    },
  )

  if (!updated) throw conflict()
  return updated
}

export interface DecisionInput {
  persistence: Persistence
  projectId: string
  suggestionIds: string[]
  actorUserId: string
  now?: string
}

export function applySuggestions(input: DecisionInput): SuggestionDecisionResult {
  assertProject(input.persistence, input.projectId)
  const now = input.now ?? new Date().toISOString()
  return input.persistence.agent.suggestions.apply(input.projectId, input.suggestionIds, input.actorUserId, now, {
    projectId: input.projectId,
    action: AGENT_EVENT_ACTIONS.suggestionsApplied,
    subjectType: 'project',
    subjectId: input.projectId,
  })
}

export function rejectSuggestions(input: DecisionInput): SuggestionDecisionResult {
  assertProject(input.persistence, input.projectId)
  const now = input.now ?? new Date().toISOString()
  return input.persistence.agent.suggestions.reject(input.projectId, input.suggestionIds, input.actorUserId, now, {
    projectId: input.projectId,
    action: AGENT_EVENT_ACTIONS.suggestionsRejected,
    subjectType: 'project',
    subjectId: input.projectId,
  })
}

export interface AgentJobView {
  id: string
  projectId: string
  scope: AgentJobScope
  tableId: string | null
  status: string
  attempts: number
  requestedBy: string
  error: string | null
  stats: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export function jobView(job: AgentJobRecord): AgentJobView {
  return {
    id: job.id,
    projectId: job.projectId,
    scope: job.scope,
    tableId: job.tableId,
    status: job.status,
    attempts: job.attempts,
    requestedBy: job.requestedBy,
    error: job.error,
    stats: job.stats,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

export function suggestionView(suggestion: AiSuggestionRecord) {
  return {
    id: suggestion.id,
    projectId: suggestion.projectId,
    jobId: suggestion.jobId,
    itemType: suggestion.itemType,
    itemId: suggestion.itemId,
    tableId: suggestion.tableId,
    suggestedDescription: suggestion.suggestedDescription,
    context: suggestion.context,
    status: suggestion.status,
    requestedBy: suggestion.requestedBy,
    decidedBy: suggestion.decidedBy,
    decidedAt: suggestion.decidedAt,
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
  }
}
