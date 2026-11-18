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

interface ErrorBody {
  error: { code: string; message: string; retryable: boolean }
}

interface ProjectBody {
  table_ids: Record<string, string>
  column_ids: Record<string, Record<string, string>>
  relationship_ids: Record<string, string[]>
}

interface ItemBody {
  item: {
    projectId: string
    itemType: string
    itemId: string
    description: string
    descriptionSource: string
    reviewed: boolean
    changed: boolean
  }
}

async function projectIds(context: TestContext, projectId: string): Promise<ProjectBody> {
  const response = await getJson<ProjectBody>(context, `/api/projects/${projectId}`)
  expect(response.response.status).toBe(200)
  return response.body
}

describe('descrição por item', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('escrita por sessão grava fonte human', async () => {
    const projectId = await seedProject(context, sampleDatabase())
    const ids = await projectIds(context, projectId)

    const response = await apiRequest<ItemBody>(
      context,
      `/api/projects/${projectId}/items/table/${ids.table_ids.pedido}/description`,
      'PATCH',
      { description: 'Pedidos confirmados' },
    )
    expect(response.response.status).toBe(200)
    expect(response.body.item.descriptionSource).toBe('human')
    expect(response.body.item.changed).toBe(true)

    const aggregate = context.persistence.projects.get(projectId)!
    expect(aggregate.tables.find((table) => table.name === 'pedido')!.description).toBe('Pedidos confirmados')
  })

  test('mudar descrição aprovada reabre revisão e audita', async () => {
    const projectId = await seedProject(context, sampleDatabase())
    const ids = await projectIds(context, projectId)
    const tableId = ids.table_ids.cliente

    const response = await apiRequest<ItemBody>(
      context,
      `/api/projects/${projectId}/items/table/${tableId}/description`,
      'PATCH',
      { description: 'Cadastro de clientes ativos' },
    )
    expect(response.response.status).toBe(200)
    expect(response.body.item.reviewed).toBe(false)

    const aggregate = context.persistence.projects.get(projectId)!
    const table = aggregate.tables.find((row) => row.id === tableId)!
    expect(table.reviewed).toBe(false)
    expect(table.reviewedBy).toBeNull()

    const event = context.persistence.agent.events
      .list(projectId)
      .find((row) => row.action === 'item.description_written')
    expect(event).toBeDefined()
    expect(event!.actorUserId).toBe(context.defaultUser.id)
    expect(event!.subjectId).toBe(tableId)
    expect(event!.payload).toMatchObject({ changed: true, descriptionSource: 'human' })
  })

  test('escrita idêntica mantém a revisão e ainda audita', async () => {
    const projectId = await seedProject(context, sampleDatabase())
    const ids = await projectIds(context, projectId)
    const tableId = ids.table_ids.cliente

    const response = await apiRequest<ItemBody>(
      context,
      `/api/projects/${projectId}/items/table/${tableId}/description`,
      'PATCH',
      { description: 'Cadastro de clientes' },
    )
    expect(response.response.status).toBe(200)
    expect(response.body.item.changed).toBe(false)
    expect(response.body.item.reviewed).toBe(true)

    const events = context.persistence.agent.events
      .list(projectId)
      .filter((row) => row.action === 'item.description_written')
    expect(events).toHaveLength(1)
    expect(events[0].payload).toMatchObject({ changed: false })
  })

  test('item desconhecido e item de outro projeto respondem 404', async () => {
    const projectA = await seedProject(context, sampleDatabase())
    const projectB = await seedProject(context, { ...sampleDatabase(), name: 'Outra' })
    const idsB = await projectIds(context, projectB)

    const unknown = await apiRequest<ErrorBody>(
      context,
      `/api/projects/${projectA}/items/table/nao-existe/description`,
      'PATCH',
      { description: 'x' },
    )
    expect(unknown.response.status).toBe(404)
    expect(unknown.body.error.code).toBe('NOT_FOUND')

    const foreign = await apiRequest<ErrorBody>(
      context,
      `/api/projects/${projectA}/items/table/${idsB.table_ids.pedido}/description`,
      'PATCH',
      { description: 'x' },
    )
    expect(foreign.response.status).toBe(404)
  })

  test('VIEWER e tipo de item inválido são rejeitados', async () => {
    const viewer = await createUser(context, {
      email: 'viewer@example.com',
      password: 'viewer-password',
      role: 'VIEWER',
    })
    const projectId = await seedProject(context, sampleDatabase())
    const ids = await projectIds(context, projectId)

    const forbidden = await apiRequest<ErrorBody>(
      context,
      `/api/projects/${projectId}/items/table/${ids.table_ids.pedido}/description`,
      'PATCH',
      { description: 'x' },
      { cookie: viewer.cookie },
    )
    expect(forbidden.response.status).toBe(403)

    const invalidType = await apiRequest<ErrorBody>(
      context,
      `/api/projects/${projectId}/items/index/${ids.table_ids.pedido}/description`,
      'PATCH',
      { description: 'x' },
    )
    expect(invalidType.response.status).toBe(400)
    expect(invalidType.body.error.code).toBe('VALIDATION_ERROR')
  })
})
