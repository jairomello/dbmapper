import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createFakeProvider, type ModelProvider } from '../agent/provider'
import { createAgentWorker, type AgentWorker } from '../agent/worker'
import {
  apiRequest,
  createTestContext,
  createUser,
  getJson,
  seedProject,
  type TestContext,
} from './helpers'

interface ErrorBody {
  error: { code: string; message: string }
}

interface JobBody {
  job: {
    id: string
    projectId: string
    scope: string
    tableId: string | null
    status: string
    attempts: number
    error: string | null
    stats: Record<string, number>
  }
}

interface Suggestion {
  id: string
  jobId: string
  itemType: 'table' | 'column'
  itemId: string
  tableId: string | null
  suggestedDescription: string
  context: Record<string, unknown>
  status: 'pending' | 'applied' | 'rejected'
  requestedBy: string
  decidedBy: string | null
  decidedAt: string | null
}

interface SuggestionBody {
  suggestion: Suggestion
}

interface SuggestionListBody {
  suggestions: Suggestion[]
}

function agentDatabase(): DatabaseModel {
  return {
    name: 'Agente',
    description: '',
    business_terms: [],
    reviewed: false,
    tables: [
      {
        name: 'pedido',
        description: '',
        business_terms: ['venda'],
        reviewed: true,
        status: 'UNCHANGED',
        relationships: { parents: [], children: [] },
        columns: [
          {
            name: 'id',
            type: 'int',
            primary_key: true,
            foreign_key: false,
            description: '',
            business_terms: [],
            reviewed: true,
            status: 'UNCHANGED',
          },
          {
            name: 'cliente_id',
            type: 'int',
            primary_key: false,
            foreign_key: true,
            description: '',
            business_terms: [],
            reviewed: false,
            status: 'UNCHANGED',
          },
        ],
      },
      {
        name: 'item',
        description: 'Itens do pedido',
        business_terms: [],
        reviewed: false,
        status: 'UNCHANGED',
        relationships: { parents: [], children: [] },
        columns: [
          {
            name: 'quantidade',
            type: 'int',
            primary_key: false,
            foreign_key: false,
            description: '',
            business_terms: [],
            reviewed: false,
            status: 'UNCHANGED',
          },
        ],
      },
    ],
  }
}

describe('API do agente', () => {
  let context: TestContext
  let provider: ModelProvider
  let worker: AgentWorker
  let projectId: string

  const base = () => `/api/projects/${projectId}/agent`

  const generate = (body: unknown = { scope: 'project' }, cookie?: string) =>
    apiRequest<JobBody>(context, `${base()}/suggestions`, 'POST', body, cookie === undefined ? {} : { cookie })

  const pending = () => getJson<SuggestionListBody>(context, `${base()}/suggestions`)

  beforeEach(async () => {
    provider = createFakeProvider()
    context = await createTestContext({ agent: { provider, startWorker: false } })
    projectId = await seedProject(context, agentDatabase())
    worker = createAgentWorker({ persistence: context.persistence, provider })
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('todas as rotas exigem sessão', async () => {
    const requests: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'POST', path: `${base()}/suggestions`, body: { scope: 'project' } },
      { method: 'GET', path: `${base()}/jobs/job-x` },
      { method: 'GET', path: `${base()}/suggestions` },
      { method: 'PATCH', path: `${base()}/suggestions/suggestion-x`, body: { text: 'x' } },
      { method: 'POST', path: `${base()}/suggestions/suggestion-x/apply` },
      { method: 'POST', path: `${base()}/suggestions/suggestion-x/reject` },
      { method: 'POST', path: `${base()}/suggestions/apply`, body: { ids: ['suggestion-x'] } },
      { method: 'POST', path: `${base()}/suggestions/reject`, body: { ids: ['suggestion-x'] } },
    ]

    for (const request of requests) {
      const response = await apiRequest<ErrorBody>(context, request.path, request.method, request.body, {
        cookie: null,
      })
      expect(response.response.status).toBe(401)
      expect(response.body.error.code).toBe('UNAUTHORIZED')
    }
  })

  test('VIEWER não pode gerar, editar, aplicar nem rejeitar', async () => {
    const viewer = await createUser(context, {
      email: 'viewer@example.com',
      password: 'viewer-password',
      role: 'VIEWER',
    })

    const requests: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'POST', path: `${base()}/suggestions`, body: { scope: 'project' } },
      { method: 'PATCH', path: `${base()}/suggestions/suggestion-x`, body: { text: 'x' } },
      { method: 'POST', path: `${base()}/suggestions/suggestion-x/apply` },
      { method: 'POST', path: `${base()}/suggestions/suggestion-x/reject` },
      { method: 'POST', path: `${base()}/suggestions/apply`, body: { ids: ['suggestion-x'] } },
      { method: 'POST', path: `${base()}/suggestions/reject`, body: { ids: ['suggestion-x'] } },
    ]

    for (const request of requests) {
      const response = await apiRequest<ErrorBody>(context, request.path, request.method, request.body, {
        cookie: viewer.cookie,
      })
      expect(response.response.status).toBe(403)
      expect(response.body.error.code).toBe('FORBIDDEN')
    }
  })

  test('sem provider configurado a geração falha com LLM_NOT_CONFIGURED e não cria job', async () => {
    const plain = await createTestContext()

    try {
      const id = await seedProject(plain, agentDatabase())
      const response = await apiRequest<ErrorBody>(
        plain,
        `/api/projects/${id}/agent/suggestions`,
        'POST',
        { scope: 'project' },
      )

      expect(response.response.status).toBe(503)
      expect(response.body.error.code).toBe('LLM_NOT_CONFIGURED')
      expect(plain.persistence.agent.jobs.listByProject(id)).toHaveLength(0)
    } finally {
      await plain.cleanup()
    }
  })

  test('gera job (202), acompanha progresso e lista sugestões pendentes com contexto', async () => {
    const created = await generate()

    expect(created.response.status).toBe(202)
    expect(created.body.job.status).toBe('queued')
    expect(created.body.job.scope).toBe('project')
    expect(JSON.stringify(created.body)).not.toContain('apiKey')

    const jobId = created.body.job.id
    const queued = await getJson<JobBody>(context, `${base()}/jobs/${jobId}`)
    expect(queued.response.status).toBe(200)
    expect(queued.body.job.status).toBe('queued')

    expect(await worker.processNext()).toBe(true)

    const succeeded = await getJson<JobBody>(context, `${base()}/jobs/${jobId}`)
    expect(succeeded.body.job.status).toBe('succeeded')
    expect(succeeded.body.job.stats).toMatchObject({ targets: 4, created: 4, tables: 2, tablesProcessed: 2 })

    const list = await pending()
    expect(list.response.status).toBe(200)
    expect(list.body.suggestions).toHaveLength(4)
    for (const suggestion of list.body.suggestions) {
      expect(suggestion.status).toBe('pending')
      expect(suggestion.jobId).toBe(jobId)
      expect(suggestion.suggestedDescription.length).toBeGreaterThan(0)
      expect(typeof suggestion.context.table).toBe('object')
      expect(typeof suggestion.context.item).toBe('object')
    }
  })

  test('escopo de tabela mira apenas a tabela informada', async () => {
    const tableId = context.persistence.projects.get(projectId)!.tables.find((table) => table.name === 'item')!.id
    const created = await generate({ scope: 'table', tableId })

    expect(created.response.status).toBe(202)
    expect(created.body.job.scope).toBe('table')
    expect(created.body.job.tableId).toBe(tableId)
    expect(created.body.job.stats.targets).toBe(1)

    await worker.processNext()
    const list = await pending()
    expect(list.body.suggestions).toHaveLength(1)
    expect(list.body.suggestions[0].itemType).toBe('column')
  })

  test('escopo de tabela inexistente responde 404', async () => {
    const response = await apiRequest<ErrorBody>(context, `${base()}/suggestions`, 'POST', {
      scope: 'table',
      tableId: 'missing-table',
    })
    expect(response.response.status).toBe(404)
    expect(response.body.error.code).toBe('NOT_FOUND')
  })

  test('edita e aplica uma sugestão, atualizando o item e a auditoria', async () => {
    await generate()
    await worker.processNext()
    const suggestion = (await pending()).body.suggestions.find((item) => item.itemType === 'column')!
    const editedText = 'Descrição editada por uma pessoa.'

    const edited = await apiRequest<SuggestionBody>(
      context,
      `${base()}/suggestions/${suggestion.id}`,
      'PATCH',
      { text: editedText },
    )
    expect(edited.response.status).toBe(200)
    expect(edited.body.suggestion.suggestedDescription).toBe(editedText)
    expect(edited.body.suggestion.status).toBe('pending')

    const applied = await apiRequest<SuggestionBody>(
      context,
      `${base()}/suggestions/${suggestion.id}/apply`,
      'POST',
    )
    expect(applied.response.status).toBe(200)
    expect(applied.body.suggestion.status).toBe('applied')
    expect(applied.body.suggestion.decidedBy).toBe(context.defaultUser.id)

    const aggregate = context.persistence.projects.get(projectId)!
    const column = aggregate.columns.find((item) => item.id === suggestion.itemId)!
    expect(column.description).toBe(editedText)
    expect(column.descriptionSource).toBe('agent')
    expect(column.reviewed).toBe(false)

    const stale = await apiRequest<ErrorBody>(context, `${base()}/suggestions/${suggestion.id}/apply`, 'POST')
    expect(stale.response.status).toBe(409)
    expect(stale.body.error.code).toBe('SUGGESTION_CONFLICT')

    const staleEdit = await apiRequest<ErrorBody>(
      context,
      `${base()}/suggestions/${suggestion.id}`,
      'PATCH',
      { text: 'outra' },
    )
    expect(staleEdit.response.status).toBe(409)

    const staleReject = await apiRequest<ErrorBody>(
      context,
      `${base()}/suggestions/${suggestion.id}/reject`,
      'POST',
    )
    expect(staleReject.response.status).toBe(409)

    const events = context.persistence.agent.events.list(projectId)
    expect(events.some((event) => event.action === 'agent.generate_requested')).toBe(true)
    expect(
      events.some(
        (event) =>
          event.action === 'agent.suggestions_edited' &&
          event.actorUserId === context.defaultUser.id &&
          event.payload.suggestionId === suggestion.id,
      ),
    ).toBe(true)
    expect(
      events.some(
        (event) =>
          event.action === 'agent.suggestions_applied' &&
          event.actorUserId === context.defaultUser.id &&
          Array.isArray(event.payload.suggestionIds) &&
          (event.payload.suggestionIds as string[]).includes(suggestion.id),
      ),
    ).toBe(true)
  })

  test('aplicar sobre item aprovado reabre a revisão e nunca marca reviewed=true', async () => {
    await generate()
    await worker.processNext()

    const tableSuggestion = (await pending()).body.suggestions.find((item) => item.itemType === 'table')!
    const before = context.persistence.projects.get(projectId)!.tables.find((table) => table.id === tableSuggestion.itemId)!
    expect(before.reviewed).toBe(true)

    const applied = await apiRequest<SuggestionBody>(
      context,
      `${base()}/suggestions/${tableSuggestion.id}/apply`,
      'POST',
    )
    expect(applied.response.status).toBe(200)

    const after = context.persistence.projects.get(projectId)!.tables.find((table) => table.id === tableSuggestion.itemId)!
    expect(after.reviewed).toBe(false)
    expect(after.descriptionSource).toBe('agent')
    expect(after.description).toBe(tableSuggestion.suggestedDescription)
  })

  test('rejeita uma sugestão sem alterar o dicionário', async () => {
    await generate()
    await worker.processNext()
    const suggestion = (await pending()).body.suggestions[0]

    const rejected = await apiRequest<SuggestionBody>(
      context,
      `${base()}/suggestions/${suggestion.id}/reject`,
      'POST',
    )
    expect(rejected.response.status).toBe(200)
    expect(rejected.body.suggestion.status).toBe('rejected')

    const aggregate = context.persistence.projects.get(projectId)!
    const target =
      suggestion.itemType === 'table'
        ? aggregate.tables.find((item) => item.id === suggestion.itemId)
        : aggregate.columns.find((item) => item.id === suggestion.itemId)
    expect(target!.description).toBe('')

    const events = context.persistence.agent.events.list(projectId)
    expect(
      events.some(
        (event) =>
          event.action === 'agent.suggestions_rejected' &&
          Array.isArray(event.payload.suggestionIds) &&
          (event.payload.suggestionIds as string[]).includes(suggestion.id),
      ),
    ).toBe(true)
  })

  test('apply e reject em lote reportam aplicados/rejeitados e ids obsoletos', async () => {
    await generate()
    await worker.processNext()
    const suggestions = (await pending()).body.suggestions
    const [first, second, third, fourth] = suggestions

    const single = await apiRequest<SuggestionBody>(
      context,
      `${base()}/suggestions/${first.id}/apply`,
      'POST',
    )
    expect(single.response.status).toBe(200)

    const bulkApply = await apiRequest<{ applied: string[]; skipped: string[] }>(
      context,
      `${base()}/suggestions/apply`,
      'POST',
      { ids: [first.id, second.id] },
    )
    expect(bulkApply.response.status).toBe(200)
    expect(bulkApply.body.applied).toEqual([second.id])
    expect(bulkApply.body.skipped).toEqual([first.id])

    const bulkReject = await apiRequest<{ rejected: string[]; skipped: string[] }>(
      context,
      `${base()}/suggestions/reject`,
      'POST',
      { ids: [third.id, fourth.id, first.id] },
    )
    expect(bulkReject.response.status).toBe(200)
    expect(bulkReject.body.rejected.sort()).toEqual([third.id, fourth.id].sort())
    expect(bulkReject.body.skipped).toEqual([first.id])

    expect((await pending()).body.suggestions).toHaveLength(0)
  })
})
