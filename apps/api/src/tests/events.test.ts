import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createTestContext, createUser, getJson, type TestContext } from './helpers'

interface ErrorBody {
  error: { code: string; message: string; retryable: boolean }
}

interface EventView {
  id: string
  projectId: string | null
  actorUserId: string | null
  actorEmail: string | null
  action: string
  subjectType: string
  subjectId: string
  payload: Record<string, unknown>
  createdAt: string
}

interface EventListBody {
  events: EventView[]
}

const ADMIN = { email: 'admin@example.com', password: 'admin-password', role: 'ADMIN' as const }

describe('GET /api/events', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext({ user: ADMIN })
  })

  afterEach(async () => {
    await context.cleanup()
  })

  function insertEvent(action: string, options: { createdAt: string; projectId?: string | null }) {
    return context.persistence.agent.events.insert({
      actorUserId: context.defaultUser.id,
      action,
      subjectType: 'project',
      subjectId: 'subject-1',
      projectId: options.projectId ?? null,
      createdAt: options.createdAt,
    })
  }

  function timestampAt(offsetSeconds: number): string {
    return new Date(Date.UTC(2026, 0, 1) + offsetSeconds * 1000).toISOString()
  }

  test('lista eventos mais recentes primeiro com o email do ator', async () => {
    insertEvent('project.created', { createdAt: '2026-01-01T00:00:00.000Z' })
    insertEvent('project.saved', { createdAt: '2026-01-02T00:00:00.000Z' })

    const { response, body } = await getJson<EventListBody>(context, '/api/events')

    expect(response.status).toBe(200)
    expect(body.events.map((event) => event.action)).toEqual(['project.saved', 'project.created'])
    expect(body.events[0].actorEmail).toBe(ADMIN.email)
    expect(body.events[0].actorUserId).toBe(context.defaultUser.id)
  })

  test('filtra por prefixo de ação e por projeto', async () => {
    insertEvent('agent.generate_requested', { createdAt: '2026-01-01T00:00:00.000Z' })
    insertEvent('agent.suggestions_applied', { createdAt: '2026-01-02T00:00:00.000Z' })
    insertEvent('project.saved', { createdAt: '2026-01-03T00:00:00.000Z' })
    const project = context.persistence.projects.create({ name: 'Projeto filtrado' })
    insertEvent('project.imported', { createdAt: '2026-01-04T00:00:00.000Z', projectId: project.id })

    const byAction = await getJson<EventListBody>(context, '/api/events?action=agent.')
    expect(byAction.response.status).toBe(200)
    expect(byAction.body.events.map((event) => event.action)).toEqual([
      'agent.suggestions_applied',
      'agent.generate_requested',
    ])

    const byProject = await getJson<EventListBody>(context, `/api/events?projectId=${project.id}`)
    expect(byProject.body.events.map((event) => event.action)).toEqual(['project.imported'])
  })

  test('limit tem default 100', async () => {
    for (let index = 0; index < 105; index += 1) {
      insertEvent('project.saved', { createdAt: timestampAt(index) })
    }

    const { body } = await getJson<EventListBody>(context, '/api/events')
    expect(body.events).toHaveLength(100)
  })

  test('limit é limitado a 500', async () => {
    for (let index = 0; index < 501; index += 1) {
      insertEvent('project.saved', { createdAt: timestampAt(index) })
    }

    const { body } = await getJson<EventListBody>(context, '/api/events?limit=1000')
    expect(body.events).toHaveLength(500)
  }, 30000)

  test('limit inválido responde 400 com o envelope', async () => {
    const { response, body } = await getJson<ErrorBody>(context, '/api/events?limit=0')
    expect(response.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  test('MEMBER e VIEWER recebem 403 e visitante 401', async () => {
    const member = await createUser(context, {
      email: 'member@example.com',
      password: 'member-password',
      role: 'MEMBER',
    })
    const viewer = await createUser(context, {
      email: 'viewer@example.com',
      password: 'viewer-password',
      role: 'VIEWER',
    })

    for (const cookie of [member.cookie, viewer.cookie]) {
      const forbidden = await getJson<ErrorBody>(context, '/api/events', { cookie })
      expect(forbidden.response.status).toBe(403)
      expect(forbidden.body.error.code).toBe('FORBIDDEN')
    }

    const unauthenticated = await getJson<ErrorBody>(context, '/api/events', { cookie: null })
    expect(unauthenticated.response.status).toBe(401)
    expect(unauthenticated.body.error.code).toBe('UNAUTHORIZED')
  })
})
