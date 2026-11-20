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
  zoneName: string
  positions: Record<string, { x: number; y: number }>
  viewport: { x: number; y: number }
  zoom: number
  updatedAt: string | null
  updatedBy: string | null
}

interface DiagramZoneBody {
  name: string
  tabOrder: number
  members: string[]
}

interface DiagramDocumentBody {
  projectId: string
  zones: DiagramZoneBody[]
  layouts: DiagramLayoutBody[]
}

interface DiagramDocumentInputBody {
  zones: DiagramZoneBody[]
  layouts: Array<{
    zoneName: string
    positions: Record<string, { x: number; y: number }>
    viewport: { x: number; y: number }
    zoom: number
  }>
}

interface ErrorBody {
  error: {
    code: string
    message: string
    retryable: boolean
    details?: { issues: Array<{ path: string; message: string; code: string }> }
  }
}

const LAYOUT = {
  positions: {
    cliente: { x: 10, y: 20 },
    pedido: { x: 300.5, y: 40 },
  },
  viewport: { x: -5, y: 12 },
  zoom: 0.8,
}

const DOCUMENT: DiagramDocumentInputBody = {
  zones: [
    { name: 'Principal', tabOrder: 0, members: ['cliente'] },
    { name: 'Vendas', tabOrder: 1, members: ['pedido'] },
  ],
  layouts: [
    {
      zoneName: 'Principal',
      positions: { cliente: { x: 10, y: 20 } },
      viewport: { x: -5, y: 12 },
      zoom: 0.8,
    },
    {
      zoneName: 'Vendas',
      positions: { pedido: { x: 300.5, y: 40 } },
      viewport: { x: 1, y: 2 },
      zoom: 1.5,
    },
  ],
}

function layoutSavedEvents(context: TestContext) {
  return context.persistence.agent.events.listAll().filter((event) => event.action === 'diagram.layout_saved')
}

describe('diagram-api: documento de layout com zonas', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('faz roundtrip do documento com zonas e layouts por um MEMBER', async () => {
    const id = await seedProject(context, sampleDatabase())

    const saved = await apiRequest<DiagramDocumentBody>(context, `/api/projects/${id}/diagram`, 'PUT', DOCUMENT)
    expect(saved.response.status).toBe(200)
    expect(saved.body.projectId).toBe(id)
    expect(saved.body.zones).toEqual(DOCUMENT.zones)
    expect(saved.body.layouts).toHaveLength(2)
    expect(saved.body.layouts[0]).toEqual({
      zoneName: 'Principal',
      positions: { cliente: { x: 10, y: 20 } },
      viewport: { x: -5, y: 12 },
      zoom: 0.8,
      updatedAt: expect.any(String),
      updatedBy: context.defaultUser.id,
    })
    expect(saved.body.layouts[1]).toEqual({
      zoneName: 'Vendas',
      positions: { pedido: { x: 300.5, y: 40 } },
      viewport: { x: 1, y: 2 },
      zoom: 1.5,
      updatedAt: expect.any(String),
      updatedBy: context.defaultUser.id,
    })

    const loaded = await getJson<DiagramDocumentBody>(context, `/api/projects/${id}/diagram`)
    expect(loaded.response.status).toBe(200)
    expect(loaded.body.zones).toEqual(DOCUMENT.zones)
    expect(loaded.body.layouts.map((layout) => layout.zoneName)).toEqual(['Principal', 'Vendas'])
    expect(loaded.body.layouts[1].positions).toEqual({ pedido: { x: 300.5, y: 40 } })
    expect(layoutSavedEvents(context)).toHaveLength(1)
  })

  test('aceita o documento legado da Fase 7 sem zones e o lê como Principal', async () => {
    const id = await seedProject(context, sampleDatabase())

    const saved = await apiRequest<DiagramDocumentBody>(context, `/api/projects/${id}/diagram`, 'PUT', LAYOUT)
    expect(saved.response.status).toBe(200)

    const loaded = await getJson<DiagramDocumentBody>(context, `/api/projects/${id}/diagram`)
    expect(loaded.response.status).toBe(200)
    expect(loaded.body.zones).toEqual([{ name: 'Principal', tabOrder: 0, members: ['cliente', 'pedido'] }])
    expect(loaded.body.layouts).toHaveLength(1)
    expect(loaded.body.layouts[0].zoneName).toBe('Principal')
    expect(loaded.body.layouts[0].positions).toEqual(LAYOUT.positions)
    expect(loaded.body.layouts[0].viewport).toEqual(LAYOUT.viewport)
    expect(loaded.body.layouts[0].zoom).toBe(LAYOUT.zoom)
    expect(layoutSavedEvents(context)).toHaveLength(1)
    expect(layoutSavedEvents(context)[0].action).toBe('diagram.layout_saved')
  })

  test('projeto sem layout responde 200 com documento Principal padrão', async () => {
    const id = await seedProject(context, sampleDatabase())

    const loaded = await getJson<DiagramDocumentBody>(context, `/api/projects/${id}/diagram`)
    expect(loaded.response.status).toBe(200)
    expect(loaded.body.zones).toEqual([{ name: 'Principal', tabOrder: 0, members: ['cliente', 'pedido'] }])
    expect(loaded.body.layouts).toEqual([
      {
        zoneName: 'Principal',
        positions: {},
        viewport: { x: 0, y: 0 },
        zoom: 1,
        updatedAt: null,
        updatedBy: null,
      },
    ])
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

  test('rejeita nome de zona duplicado com envelope e não grava evento', async () => {
    const id = await seedProject(context, sampleDatabase())
    const before = context.persistence.agent.events.listAll().length

    const duplicate = await apiRequest<ErrorBody>(context, `/api/projects/${id}/diagram`, 'PUT', {
      zones: [
        { name: 'Principal', tabOrder: 0, members: ['cliente'] },
        { name: 'Principal', tabOrder: 1, members: ['pedido'] },
      ],
      layouts: [
        {
          zoneName: 'Principal',
          positions: { cliente: { x: 0, y: 0 } },
          viewport: { x: 0, y: 0 },
          zoom: 1,
        },
      ],
    })

    expect(duplicate.response.status).toBe(400)
    expect(duplicate.body.error.code).toBe('VALIDATION_ERROR')
    expect(duplicate.body.error.details?.issues).toEqual([
      {
        path: 'zones.1.name',
        message: 'Nome de zona duplicado: Principal.',
        code: 'custom',
      },
    ])
    expect(context.persistence.agent.events.listAll()).toHaveLength(before)
  })

  test('rejeita membro desconhecido com envelope e não grava evento', async () => {
    const id = await seedProject(context, sampleDatabase())
    const before = context.persistence.agent.events.listAll().length

    const invalid = await apiRequest<ErrorBody>(context, `/api/projects/${id}/diagram`, 'PUT', {
      zones: [{ name: 'Principal', tabOrder: 0, members: ['tabela_inexistente'] }],
      layouts: [],
    })

    expect(invalid.response.status).toBe(400)
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR')
    expect(invalid.body.error.details?.issues).toEqual([
      {
        path: 'zones.0.members.0',
        message: 'Tabela desconhecida na zona Principal: tabela_inexistente.',
        code: 'custom',
      },
    ])
    expect(context.persistence.agent.events.listAll()).toHaveLength(before)
  })

  test('VIEWER lê o documento mas recebe 403 no PUT e o documento não muda', async () => {
    const id = await seedProject(context, sampleDatabase())
    const viewer = await createUser(context, {
      email: 'viewer@example.com',
      password: 'viewer-password',
      role: 'VIEWER',
    })

    const saved = await apiRequest<DiagramDocumentBody>(context, `/api/projects/${id}/diagram`, 'PUT', DOCUMENT)
    expect(saved.response.status).toBe(200)

    const read = await getJson<DiagramDocumentBody>(context, `/api/projects/${id}/diagram`, {
      cookie: viewer.cookie,
    })
    expect(read.response.status).toBe(200)
    expect(read.body.zones).toEqual(DOCUMENT.zones)

    const forbidden = await apiRequest<ErrorBody>(
      context,
      `/api/projects/${id}/diagram`,
      'PUT',
      {
        zones: [{ name: 'Principal', tabOrder: 0, members: ['pedido'] }],
        layouts: [
          {
            zoneName: 'Principal',
            positions: { pedido: { x: 999, y: 999 } },
            viewport: { x: 0, y: 0 },
            zoom: 2,
          },
        ],
      },
      { cookie: viewer.cookie },
    )
    expect(forbidden.response.status).toBe(403)
    expect(forbidden.body.error.code).toBe('FORBIDDEN')

    const after = await getJson<DiagramDocumentBody>(context, `/api/projects/${id}/diagram`)
    expect(after.body.zones).toEqual(DOCUMENT.zones)
    expect(after.body.layouts[0].positions).toEqual(DOCUMENT.layouts[0].positions)
    expect(after.body.layouts[0].zoom).toBe(DOCUMENT.layouts[0].zoom)
  })
})
