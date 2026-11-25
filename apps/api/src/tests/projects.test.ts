import type { DatabaseModel } from '@dbmapper/domain'
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

interface ProjectViewBody {
  id: string
  name: string
  description: string
  businessTerms: string[]
  reviewed: boolean
  createdAt: string
  updatedAt: string
  table_ids: Record<string, string>
  database: DatabaseModel
}

interface ProjectSummary {
  id: string
  name: string
}

interface ErrorBody {
  error: { code: string }
}

describe('project-api: CRUD de projetos', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('cria um projeto vazio com id, nome e timestamps', async () => {
    const { response, body } = await apiRequest<ProjectViewBody>(context, '/api/projects', 'POST', {
      name: 'Novo Banco',
    })

    expect(response.status).toBe(201)
    expect(body.id).toBeTruthy()
    expect(body.name).toBe('Novo Banco')
    expect(body.createdAt).toBeTruthy()
    expect(body.updatedAt).toBeTruthy()
    expect(body.table_ids).toEqual({})
    expect(body.database.tables).toEqual([])
  })

  test('lista todos os projetos com id e nome', async () => {
    await apiRequest(context, '/api/projects', 'POST', { name: 'Projeto A' })
    await apiRequest(context, '/api/projects', 'POST', { name: 'Projeto B' })

    const { response, body } = await getJson<ProjectSummary[]>(context, '/api/projects')
    expect(response.status).toBe(200)
    expect(body.map((project) => project.name)).toEqual(['Projeto A', 'Projeto B'])
    expect(body.every((project) => project.id.length > 0)).toBe(true)
  })

  test('busca um projeto com o modelo completo', async () => {
    const database = sampleDatabase()
    const id = await seedProject(context, database)

    const { response, body } = await getJson<ProjectViewBody>(context, `/api/projects/${id}`)
    expect(response.status).toBe(200)
    expect(body.id).toBe(id)
    expect(body.database.tables.map((table) => table.name)).toEqual(['cliente', 'pedido'])

    const internalTables = context.persistence.projects.get(id)!.tables
    expect(body.table_ids).toEqual(
      Object.fromEntries(internalTables.map((table) => [table.name, table.id])),
    )

    const pedido = body.database.tables.find((table) => table.name === 'pedido')!
    const cliente = body.database.tables.find((table) => table.name === 'cliente')!
    expect(pedido.relationships.parents).toHaveLength(1)
    expect(pedido.relationships.parents[0].table).toBe('cliente')
    expect(cliente.relationships.children[0].table).toBe('pedido')
  })

  test('salvar substitui o modelo e normaliza children a partir de parents', async () => {
    const id = await seedProject(context, sampleDatabase())

    const database = sampleDatabase()
    database.description = 'Modelo atualizado'
    database.tables[1].relationships.parents[0].constraint_name = 'fk_novo'
    database.tables[0].relationships.children = [
      {
        table: 'pedido',
        local_columns: ['id'],
        referenced_columns: ['cliente_id'],
        constraint_name: 'fk_antiga',
        description: 'stale',
        reviewed: true,
      },
    ]

    const saved = await apiRequest<ProjectViewBody>(context, `/api/projects/${id}`, 'PUT', { database })
    expect(saved.response.status).toBe(200)
    expect(saved.body.database.description).toBe('Modelo atualizado')
    expect(saved.body.table_ids).toEqual(
      Object.fromEntries(
        context.persistence.projects.get(id)!.tables.map((table) => [table.name, table.id]),
      ),
    )

    const pedido = saved.body.database.tables.find((table) => table.name === 'pedido')!
    const cliente = saved.body.database.tables.find((table) => table.name === 'cliente')!
    expect(pedido.relationships.parents[0].constraint_name).toBe('fk_novo')
    expect(cliente.relationships.children).toEqual([
      {
        table: 'pedido',
        local_columns: ['id'],
        referenced_columns: ['cliente_id'],
        constraint_name: 'fk_novo',
        description: '',
        reviewed: false,
      },
    ])

    const reloaded = await getJson<ProjectViewBody>(context, `/api/projects/${id}`)
    expect(reloaded.body.database.description).toBe('Modelo atualizado')
  })

  test('renomeia um projeto e registra project.renamed', async () => {
    const created = await apiRequest<ProjectViewBody>(context, '/api/projects', 'POST', { name: 'Novo Banco' })

    const renamed = await apiRequest<ProjectSummary>(context, `/api/projects/${created.body.id}`, 'PATCH', {
      name: '  Banco Central  ',
    })

    expect(renamed.response.status).toBe(200)
    expect(renamed.body.name).toBe('Banco Central')

    const reloaded = await getJson<ProjectViewBody>(context, `/api/projects/${created.body.id}`)
    expect(reloaded.body.name).toBe('Banco Central')

    const events = context.persistence.agent.events.listAll().filter((event) => event.action === 'project.renamed')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      projectId: created.body.id,
      actorUserId: context.defaultUser.id,
      payload: { from: 'Novo Banco', to: 'Banco Central' },
    })
  })

  test('rename inválido ou projeto inexistente não altera nada', async () => {
    const created = await apiRequest<ProjectViewBody>(context, '/api/projects', 'POST', { name: 'Original' })

    const empty = await apiRequest<ErrorBody>(context, `/api/projects/${created.body.id}`, 'PATCH', { name: '   ' })
    expect(empty.response.status).toBe(400)
    expect(empty.body.error.code).toBe('VALIDATION_ERROR')

    const missing = await apiRequest<ErrorBody>(context, '/api/projects/missing', 'PATCH', { name: 'Nome' })
    expect(missing.response.status).toBe(404)
    expect(missing.body.error.code).toBe('NOT_FOUND')

    expect(context.persistence.projects.get(created.body.id)!.project.name).toBe('Original')
    expect(context.persistence.agent.events.listAll().some((event) => event.action === 'project.renamed')).toBe(false)
  })

  test('VIEWER não pode renomear', async () => {
    const created = await apiRequest<ProjectViewBody>(context, '/api/projects', 'POST', { name: 'Somente leitura' })
    const viewer = await createUser(context, {
      email: 'viewer-rename@example.com',
      password: 'viewer-password',
      role: 'VIEWER',
    })

    const response = await apiRequest<ErrorBody>(
      context,
      `/api/projects/${created.body.id}`,
      'PATCH',
      { name: 'Tentativa' },
      { cookie: viewer.cookie },
    )

    expect(response.response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(context.persistence.projects.get(created.body.id)!.project.name).toBe('Somente leitura')
  })

  test('projeto inexistente retorna 404 com envelope e nada muda', async () => {
    const get = await getJson<ErrorBody>(context, '/api/projects/missing')
    expect(get.response.status).toBe(404)
    expect(get.body.error.code).toBe('NOT_FOUND')

    const put = await apiRequest<ErrorBody>(context, '/api/projects/missing', 'PUT', {
      database: sampleDatabase(),
    })
    expect(put.response.status).toBe(404)
    expect(put.body.error.code).toBe('NOT_FOUND')

    const list = await getJson<ProjectSummary[]>(context, '/api/projects')
    expect(list.body).toEqual([])
  })
})
