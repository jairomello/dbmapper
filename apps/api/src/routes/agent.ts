import type { Hono } from 'hono'
import type { ModelProvider } from '../agent/provider'
import { ApiError } from '../errors'
import { requireRole } from '../middleware/session'
import type { Persistence } from '../persistence/ports'
import {
  applySuggestions,
  createGenerationJob,
  editSuggestion,
  jobView,
  rejectSuggestions,
  suggestionView,
} from '../services/agent'
import type { AppEnv } from '../types'
import {
  agentEditSuggestionSchema,
  agentGenerateSchema,
  agentSuggestionIdsSchema,
  aiSuggestionStatusSchema,
  parseJsonBody,
} from '../validation'

export interface AgentRouteOptions {
  provider: ModelProvider | null
}

export function registerAgentRoutes(
  app: Hono<AppEnv>,
  persistence: Persistence,
  options: AgentRouteOptions,
): void {
  const requireMember = requireRole('MEMBER')
  const base = '/api/projects/:projectId/agent'

  app.post(`${base}/suggestions`, requireMember, async (c) => {
    const projectId = c.req.param('projectId')
    const body = await parseJsonBody(c, agentGenerateSchema)
    const job = createGenerationJob({
      persistence,
      provider: options.provider,
      projectId,
      scope: body.scope,
      tableId: body.scope === 'table' ? body.tableId : null,
      actorUserId: c.get('user').sub,
    })
    return c.json({ job: jobView(job) }, 202)
  })

  app.get(`${base}/jobs/:jobId`, (c) => {
    const projectId = c.req.param('projectId')
    if (!persistence.projects.get(projectId)) {
      throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')
    }

    const job = persistence.agent.jobs.get(c.req.param('jobId'))
    if (!job || job.projectId !== projectId) {
      throw new ApiError(404, 'NOT_FOUND', 'Job não encontrado.')
    }
    return c.json({ job: jobView(job) })
  })

  app.get(`${base}/suggestions`, (c) => {
    const projectId = c.req.param('projectId')
    if (!persistence.projects.get(projectId)) {
      throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')
    }

    const status = aiSuggestionStatusSchema.safeParse(c.req.query('status') ?? 'pending')
    if (!status.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Status de sugestão inválido.')
    }

    const suggestions = persistence.agent.suggestions.list(projectId, status.data).map(suggestionView)
    return c.json({ suggestions })
  })

  app.patch(`${base}/suggestions/:id`, requireMember, async (c) => {
    const body = await parseJsonBody(c, agentEditSuggestionSchema)
    const suggestion = editSuggestion({
      persistence,
      projectId: c.req.param('projectId'),
      suggestionId: c.req.param('id'),
      text: body.text,
      actorUserId: c.get('user').sub,
    })
    return c.json({ suggestion: suggestionView(suggestion) })
  })

  app.post(`${base}/suggestions/:id/apply`, requireMember, (c) => {
    const projectId = c.req.param('projectId')
    const suggestionId = c.req.param('id')
    const suggestion = persistence.agent.suggestions.get(suggestionId)
    if (!suggestion || suggestion.projectId !== projectId) {
      throw new ApiError(404, 'NOT_FOUND', 'Sugestão não encontrada.')
    }

    const result = applySuggestions({
      persistence,
      projectId,
      suggestionIds: [suggestionId],
      actorUserId: c.get('user').sub,
    })
    if (result.decided.length === 0) {
      throw new ApiError(409, 'SUGGESTION_CONFLICT', 'A sugestão não está mais pendente.')
    }
    return c.json({ suggestion: suggestionView(result.decided[0]) })
  })

  app.post(`${base}/suggestions/:id/reject`, requireMember, (c) => {
    const projectId = c.req.param('projectId')
    const suggestionId = c.req.param('id')
    const suggestion = persistence.agent.suggestions.get(suggestionId)
    if (!suggestion || suggestion.projectId !== projectId) {
      throw new ApiError(404, 'NOT_FOUND', 'Sugestão não encontrada.')
    }

    const result = rejectSuggestions({
      persistence,
      projectId,
      suggestionIds: [suggestionId],
      actorUserId: c.get('user').sub,
    })
    if (result.decided.length === 0) {
      throw new ApiError(409, 'SUGGESTION_CONFLICT', 'A sugestão não está mais pendente.')
    }
    return c.json({ suggestion: suggestionView(result.decided[0]) })
  })

  app.post(`${base}/suggestions/apply`, requireMember, async (c) => {
    const body = await parseJsonBody(c, agentSuggestionIdsSchema)
    const result = applySuggestions({
      persistence,
      projectId: c.req.param('projectId'),
      suggestionIds: body.ids,
      actorUserId: c.get('user').sub,
    })
    return c.json({
      applied: result.decided.map((suggestion) => suggestion.id),
      skipped: result.skipped,
    })
  })

  app.post(`${base}/suggestions/reject`, requireMember, async (c) => {
    const body = await parseJsonBody(c, agentSuggestionIdsSchema)
    const result = rejectSuggestions({
      persistence,
      projectId: c.req.param('projectId'),
      suggestionIds: body.ids,
      actorUserId: c.get('user').sub,
    })
    return c.json({
      rejected: result.decided.map((suggestion) => suggestion.id),
      skipped: result.skipped,
    })
  })
}
