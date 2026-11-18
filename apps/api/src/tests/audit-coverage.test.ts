import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createFakeProvider, type ModelProvider } from '../agent/provider'
import { createAgentWorker, type AgentWorker } from '../agent/worker'
import type { DatabaseModel } from '@dbmapper/domain'
import type { ImportPlan } from '../services/model-import'
import {
  apiRequest,
  createTestContext,
  createUser,
  getJson,
  sampleDatabase,
  seedProject,
  type TestContext,
} from './helpers'

interface ErrorBody {
  error: { code: string; message: string; retryable: boolean }
}

interface ProjectBody {
  id: string
}

interface KeyBody {
  key: string
  apiKey: { id: string }
}

interface SuggestionListBody {
  suggestions: Array<{ id: string }>
}

interface PreviewBody {
  plan: ImportPlan
}

const ADMIN = { email: 'admin@example.com', password: 'admin-password', role: 'ADMIN' as const }

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
        reviewed: false,
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
            reviewed: false,
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
    ],
  }
}

describe('auditoria: cobertura das rotas mutantes', () => {
  let context: TestContext
  let provider: ModelProvider
  let worker: AgentWorker
  let projectId: string
  let agentProjectId: string
  let targetUserId: string

  beforeEach(async () => {
    provider = createFakeProvider()
    context = await createTestContext({ user: ADMIN, agent: { provider, startWorker: false } })
    worker = createAgentWorker({ persistence: context.persistence, provider })
    projectId = await seedProject(context, sampleDatabase())
    agentProjectId = await seedProject(context, agentDatabase())
    const target = await createUser(context, {
      email: 'target@example.com',
      password: 'target-password',
      role: 'MEMBER',
    })
    targetUserId = target.user.id
  })

  afterEach(async () => {
    await context.cleanup()
  })

  function eventIds(): Set<string> {
    return new Set(context.persistence.agent.events.listAll().map((event) => event.id))
  }

  function newEvents(before: Set<string>) {
    return context.persistence.agent.events.listAll().filter((event) => !before.has(event.id))
  }

  async function generateSuggestions(): Promise<string[]> {
    const generated = await apiRequest(context, `/api/projects/${agentProjectId}/agent/suggestions`, 'POST', {
      scope: 'project',
    })
    expect(generated.response.status).toBe(202)
    expect(await worker.processNext()).toBe(true)
    const listed = await getJson<SuggestionListBody>(
      context,
      `/api/projects/${agentProjectId}/agent/suggestions?status=pending`,
    )
    return listed.body.suggestions.map((suggestion) => suggestion.id)
  }

  interface Case {
    name: string
    action: string
    run: () => Promise<void>
  }

  const cases: Case[] = [
    {
      name: 'POST /api/projects',
      action: 'project.created',
      run: async () => {
        const created = await apiRequest<ProjectBody>(context, '/api/projects', 'POST', { name: 'Auditado' })
        expect(created.response.status).toBe(201)
      },
    },
    {
      name: 'PUT /api/projects/:id',
      action: 'project.saved',
      run: async () => {
        const saved = await apiRequest(context, `/api/projects/${projectId}`, 'PUT', { database: sampleDatabase() })
        expect(saved.response.status).toBe(200)
      },
    },
    {
      name: 'POST /api/projects/import',
      action: 'project.imported',
      run: async () => {
        const imported = await apiRequest(context, '/api/projects/import', 'POST', {
          database: sampleDatabase(),
        })
        expect(imported.response.status).toBe(201)
      },
    },
    {
      name: 'POST /api/projects/:id/imports/apply',
      action: 'model.import_applied',
      run: async () => {
        const sql = 'CREATE TABLE produto (id int);'
        const preview = await apiRequest<PreviewBody>(context, `/api/projects/${projectId}/imports/preview`, 'POST', {
          sql,
        })
        expect(preview.response.status).toBe(200)
        const applied = await apiRequest(context, `/api/projects/${projectId}/imports/apply`, 'POST', {
          sql,
          plan: preview.body.plan,
        })
        expect(applied.response.status).toBe(200)
      },
    },
    {
      name: 'PATCH /api/projects/:id/items/:itemType/:itemId/description',
      action: 'item.description_written',
      run: async () => {
        const aggregate = context.persistence.projects.get(projectId)
        if (!aggregate) throw new Error('Projeto não encontrado.')
        const response = await apiRequest(
          context,
          `/api/projects/${projectId}/items/table/${aggregate.tables[0].id}/description`,
          'PATCH',
          { description: 'Descrição auditada' },
        )
        expect(response.response.status).toBe(200)
      },
    },
    {
      name: 'POST /api/users',
      action: 'user.created',
      run: async () => {
        const response = await apiRequest(context, '/api/users', 'POST', {
          email: 'novo@example.com',
          password: 'novo-password',
          role: 'MEMBER',
        })
        expect(response.response.status).toBe(201)
      },
    },
    {
      name: 'PATCH /api/users/:id',
      action: 'user.role_changed',
      run: async () => {
        const response = await apiRequest(context, `/api/users/${targetUserId}`, 'PATCH', { role: 'ADMIN' })
        expect(response.response.status).toBe(200)
      },
    },
    {
      name: 'POST /api/keys',
      action: 'api_key.created',
      run: async () => {
        const response = await apiRequest(context, '/api/keys', 'POST', { name: 'auditada' })
        expect(response.response.status).toBe(201)
      },
    },
    {
      name: 'DELETE /api/keys/:id',
      action: 'api_key.revoked',
      run: async () => {
        const created = await apiRequest<KeyBody>(context, '/api/keys', 'POST', { name: 'revogada' })
        const revoked = await apiRequest(context, `/api/keys/${created.body.apiKey.id}`, 'DELETE')
        expect(revoked.response.status).toBe(200)
      },
    },
    {
      name: 'POST /api/projects/:id/agent/suggestions',
      action: 'agent.generate_requested',
      run: async () => {
        expect((await generateSuggestions()).length).toBeGreaterThan(0)
      },
    },
    {
      name: 'PATCH /api/projects/:id/agent/suggestions/:id',
      action: 'agent.suggestions_edited',
      run: async () => {
        const [suggestionId] = await generateSuggestions()
        const response = await apiRequest(
          context,
          `/api/projects/${agentProjectId}/agent/suggestions/${suggestionId}`,
          'PATCH',
          { text: 'Texto revisado pela auditoria' },
        )
        expect(response.response.status).toBe(200)
      },
    },
    {
      name: 'POST /api/projects/:id/agent/suggestions/:id/apply',
      action: 'agent.suggestions_applied',
      run: async () => {
        const [suggestionId] = await generateSuggestions()
        const response = await apiRequest(
          context,
          `/api/projects/${agentProjectId}/agent/suggestions/${suggestionId}/apply`,
          'POST',
        )
        expect(response.response.status).toBe(200)
      },
    },
    {
      name: 'POST /api/projects/:id/agent/suggestions/:id/reject',
      action: 'agent.suggestions_rejected',
      run: async () => {
        const [suggestionId] = await generateSuggestions()
        const response = await apiRequest(
          context,
          `/api/projects/${agentProjectId}/agent/suggestions/${suggestionId}/reject`,
          'POST',
        )
        expect(response.response.status).toBe(200)
      },
    },
    {
      name: 'POST /api/projects/:id/agent/suggestions/apply',
      action: 'agent.suggestions_applied',
      run: async () => {
        const ids = await generateSuggestions()
        const response = await apiRequest(context, `/api/projects/${agentProjectId}/agent/suggestions/apply`, 'POST', {
          ids: ids.slice(0, 1),
        })
        expect(response.response.status).toBe(200)
      },
    },
    {
      name: 'POST /api/projects/:id/agent/suggestions/reject',
      action: 'agent.suggestions_rejected',
      run: async () => {
        const ids = await generateSuggestions()
        const response = await apiRequest(context, `/api/projects/${agentProjectId}/agent/suggestions/reject`, 'POST', {
          ids: ids.slice(0, 1),
        })
        expect(response.response.status).toBe(200)
      },
    },
  ]

  for (const item of cases) {
    test(`${item.name} grava ${item.action} com ator e assunto`, async () => {
      const before = eventIds()
      await item.run()

      const events = newEvents(before)
      const event = events.find((candidate) => candidate.action === item.action)
      expect(event).toBeDefined()
      expect(event!.actorUserId).toBe(context.defaultUser.id)
      expect(event!.subjectId.length).toBeGreaterThan(0)
      expect(event!.action).toMatch(/^[a-z_]+\.[a-z_]+$/)
    })
  }

  test('mutação que falha ou não encontra o alvo não deixa evento', async () => {
    const before = eventIds()

    const missingProject = await apiRequest(context, '/api/projects/inexistente', 'PUT', { database: sampleDatabase() })
    expect(missingProject.response.status).toBe(404)

    const duplicateUser = await apiRequest<ErrorBody>(context, '/api/users', 'POST', {
      email: ADMIN.email,
      password: 'outra-senha',
      role: 'MEMBER',
    })
    expect(duplicateUser.response.status).toBe(409)
    expect(duplicateUser.body.error.code).toBe('EMAIL_ALREADY_EXISTS')

    const missingItem = await apiRequest(
      context,
      `/api/projects/${projectId}/items/table/inexistente/description`,
      'PATCH',
      { description: 'não deve gravar' },
    )
    expect(missingItem.response.status).toBe(404)

    const missingKey = await apiRequest(context, '/api/keys/inexistente', 'DELETE')
    expect(missingKey.response.status).toBe(404)

    context.persistence.users.updateRole('inexistente', 'ADMIN', {
      audit: {
        actorUserId: context.defaultUser.id,
        action: 'user.role_changed',
        subjectType: 'user',
        subjectId: 'inexistente',
      },
    })
    context.persistence.projects.replaceModel('inexistente', sampleDatabase(), {
      actorUserId: context.defaultUser.id,
      audit: {
        actorUserId: context.defaultUser.id,
        action: 'project.saved',
        subjectType: 'project',
        subjectId: 'inexistente',
      },
    })

    expect(newEvents(before)).toHaveLength(0)
  })
})
