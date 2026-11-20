import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  apiRequest,
  createTestContext,
  createUser,
  getJson,
  sampleDatabase,
  seedProject,
  type TestContext,
} from './helpers'

interface DiagramLayoutBody {
  projectId: string
  zoneName: string
  positions: Record<string, { x: number; y: number }>
  viewport: { x: number; y: number }
  zoom: number
  updatedAt: string | null
  updatedBy: string | null
}

interface ErrorBody {
  error: { code: string; message: string; retryable: boolean }
}

const LAYOUT = {
  positions: {
    cliente: { x: 10, y: 20 },
    pedido: { x: 300.5, y: 40 },
  },
  viewport: { x: -5, y: 12 },
  zoom: 0.8,
}

describe('diagram-api: layout do diagrama', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('faz roundtrip do layout salvo por um MEMBER', async () => {
    const id = await seedProject(context, sampleDatabase())

    const saved = await apiRequest<DiagramLayoutBody>(context, `/api/projects/${id}/diagram`, 'PUT', LAYOUT)
    expect(saved.response.status).toBe(200)
    expect(saved.body.projectId).toBe(id)
    expect(saved.body.zoneName).toBe('Principal')
    expect(saved.body.positions).toEqual(LAYOUT.positions)
    expect(saved.body.viewport).toEqual(LAYOUT.viewport)
    expect(saved.body.zoom).toBe(LAYOUT.zoom)

    const loaded = await getJson<DiagramLayoutBody>(context, `/api/projects/${id}/diagram`)
    expect(loaded.response.status).toBe(200)
    expect(loaded.body.positions).toEqual(LAYOUT.positions)
    expect(loaded.body.viewport).toEqual(LAYOUT.viewport)
    expect(loaded.body.zoom).toBe(LAYOUT.zoom)
    expect(loaded.body.zoneName).toBe('Principal')
  })

  test('projeto sem layout responde 200 com layout vazio', async () => {
    const id = await seedProject(context, sampleDatabase())

    const loaded = await getJson<DiagramLayoutBody>(context, `/api/projects/${id}/diagram`)
    expect(loaded.response.status).toBe(200)
    expect(loaded.body.positions).toEqual({})
    expect(loaded.body.viewport).toEqual({ x: 0, y: 0 })
    expect(loaded.body.zoom).toBe(1)
  })

  test('projeto inexistente retorna 404 com envelope e não grava evento', async () => {
    const before = context.persistence.agent.events.listAll().length

    const get = await getJson<ErrorBody>(context, '/api/projects/inexistente/diagram')
    expect(get.response.status).toBe(404)
    expect(get.body.error.code).toBe('NOT_FOUND')

    const put = await apiRequest<ErrorBody>(context, '/api/projects/inexistente/diagram', 'PUT', LAYOUT)
    expect(put.response.status).toBe(404)
    expect(put.body.error.code).toBe('NOT_FOUND')

    expect(context.persistence.agent.events.listAll()).toHaveLength(before)
  })

  test('VIEWER lê o layout mas recebe 403 no PUT e o layout não muda', async () => {
    const id = await seedProject(context, sampleDatabase())
    const viewer = await createUser(context, {
      email: 'viewer@example.com',
      password: 'viewer-password',
      role: 'VIEWER',
    })

    const saved = await apiRequest<DiagramLayoutBody>(context, `/api/projects/${id}/diagram`, 'PUT', LAYOUT)
    expect(saved.response.status).toBe(200)

    const read = await getJson<DiagramLayoutBody>(context, `/api/projects/${id}/diagram`, {
      cookie: viewer.cookie,
    })
    expect(read.response.status).toBe(200)
    expect(read.body.positions).toEqual(LAYOUT.positions)

    const forbidden = await apiRequest<ErrorBody>(context, `/api/projects/${id}/diagram`, 'PUT', {
      positions: { cliente: { x: 999, y: 999 } },
      viewport: { x: 0, y: 0 },
      zoom: 2,
    }, { cookie: viewer.cookie })
    expect(forbidden.response.status).toBe(403)
    expect(forbidden.body.error.code).toBe('FORBIDDEN')

    const after = await getJson<DiagramLayoutBody>(context, `/api/projects/${id}/diagram`)
    expect(after.body.positions).toEqual(LAYOUT.positions)
    expect(after.body.zoom).toBe(LAYOUT.zoom)
  })
})
