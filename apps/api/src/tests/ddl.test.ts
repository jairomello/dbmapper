import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
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

interface DdlBody {
  dialect: 'postgres' | 'mysql'
  mode: 'create' | 'migration'
  script: string
  statements: string[]
  destructive: string[]
  warnings: string[]
}

interface BaselineBody {
  baseline: {
    projectId: string
    capturedAt: string
    capturedBy: string | null
  }
}

interface BaselineReadBody {
  baseline: {
    projectId: string
    capturedAt: string
    capturedBy: string | null
    database: DatabaseModel
  } | null
}

interface ErrorBody {
  error: { code: string; message: string; retryable: boolean }
}

function databaseWithProduct(): DatabaseModel {
  const database = sampleDatabase()
  database.tables.push({
    name: 'produto',
    description: 'Catálogo',
    business_terms: [],
    reviewed: false,
    status: 'NEW',
    relationships: { parents: [], children: [] },
    columns: [
      {
        name: 'id',
        type: 'serial',
        primary_key: true,
        foreign_key: false,
        description: '',
        business_terms: [],
        reviewed: false,
        status: 'NEW',
      },
      {
        name: 'nome',
        type: 'text',
        primary_key: false,
        foreign_key: false,
        description: '',
        business_terms: [],
        reviewed: false,
        status: 'NEW',
      },
    ],
  })
  return database
}

function databaseWithRenamedTable(): DatabaseModel {
  const database = sampleDatabase()
  database.tables[0].name = 'clientes'
  database.tables[1].relationships.parents[0].table = 'clientes'
  return database
}

function renamesQuery(mapping: unknown): string {
  return encodeURIComponent(JSON.stringify(mapping))
}

function ddlEvents(context: TestContext) {
  return context.persistence.agent.events.listAll().filter((event) => event.action === 'ddl.baseline_captured')
}

describe('ddl-api: geração de script e baseline', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('gera o script completo em postgres e mysql por padrão', async () => {
    const id = await seedProject(context, sampleDatabase())

    const postgres = await getJson<DdlBody>(context, `/api/projects/${id}/ddl`)
    expect(postgres.response.status).toBe(200)
    expect(postgres.body.dialect).toBe('postgres')
    expect(postgres.body.mode).toBe('create')
    expect(postgres.body.statements.join('\n')).toContain('CREATE TABLE "cliente"')
    expect(postgres.body.statements.join('\n')).toContain('CREATE TABLE "pedido"')
    expect(postgres.body.statements.join('\n')).toContain('FOREIGN KEY')
    expect(postgres.body.script).toContain('CREATE TABLE "cliente"')
    expect(postgres.body.script).not.toContain('Cadastro de clientes')
    expect(postgres.body.destructive).toEqual([])

    const mysql = await getJson<DdlBody>(context, `/api/projects/${id}/ddl?dialect=mysql`)
    expect(mysql.response.status).toBe(200)
    expect(mysql.body.dialect).toBe('mysql')
    expect(mysql.body.script).toContain('CREATE TABLE `cliente`')
  })

  test('modo migration sem baseline responde 409 DDL_BASELINE_MISSING', async () => {
    const id = await seedProject(context, sampleDatabase())

    const response = await getJson<ErrorBody>(context, `/api/projects/${id}/ddl?mode=migration`)
    expect(response.response.status).toBe(409)
    expect(response.body.error.code).toBe('DDL_BASELINE_MISSING')
  })

  test('captura o baseline e gera migração a partir dele', async () => {
    const id = await seedProject(context, sampleDatabase())

    const captured = await apiRequest<BaselineBody>(context, `/api/projects/${id}/ddl/baseline`, 'PUT')
    expect(captured.response.status).toBe(200)
    expect(captured.body.baseline.projectId).toBe(id)
    expect(captured.body.baseline.capturedAt).toEqual(expect.any(String))
    expect(captured.body.baseline.capturedBy).toBe(context.defaultUser.id)

    const unchanged = await getJson<DdlBody>(context, `/api/projects/${id}/ddl?mode=migration`)
    expect(unchanged.response.status).toBe(200)
    expect(unchanged.body.statements).toEqual([])
    expect(unchanged.body.destructive).toEqual([])

    const updated = await apiRequest(context, `/api/projects/${id}`, 'PUT', { database: databaseWithProduct() })
    expect(updated.response.status).toBe(200)

    const migration = await getJson<DdlBody>(
      context,
      `/api/projects/${id}/ddl?mode=migration&dialect=mysql`,
    )
    expect(migration.response.status).toBe(200)
    expect(migration.body.dialect).toBe('mysql')
    expect(migration.body.statements.join('\n')).toContain('CREATE TABLE `produto`')
    expect(migration.body.script).toContain('CREATE TABLE `produto`')
  })

  test('rename explícito vira ALTER TABLE e a ausência do mapa vira DROP+CREATE destrutivo', async () => {
    const id = await seedProject(context, sampleDatabase())
    await apiRequest(context, `/api/projects/${id}/ddl/baseline`, 'PUT')
    await apiRequest(context, `/api/projects/${id}`, 'PUT', { database: databaseWithRenamedTable() })

    const renamed = await getJson<DdlBody>(
      context,
      `/api/projects/${id}/ddl?mode=migration&renames=${renamesQuery({ tables: { cliente: 'clientes' } })}`,
    )
    expect(renamed.response.status).toBe(200)
    expect(renamed.body.statements).toContain('ALTER TABLE "cliente" RENAME TO "clientes"')
    expect(renamed.body.destructive).toEqual([])

    const dropped = await getJson<DdlBody>(context, `/api/projects/${id}/ddl?mode=migration`)
    expect(dropped.response.status).toBe(200)
    expect(dropped.body.statements).toContain('DROP TABLE "cliente"')
    expect(dropped.body.statements.some((statement) => statement.startsWith('CREATE TABLE "clientes"'))).toBe(true)
    expect(dropped.body.destructive).toContain('DROP TABLE "cliente"')
    expect(dropped.body.warnings.length).toBeGreaterThan(0)
  })

  test('renames inválidos, chave de coluna sem tabela e limite excedido respondem DDL_INVALID_RENAMES', async () => {
    const id = await seedProject(context, sampleDatabase())

    const invalidJson = await getJson<ErrorBody>(
      context,
      `/api/projects/${id}/ddl?renames=${encodeURIComponent('{invalido')}`,
    )
    expect(invalidJson.response.status).toBe(400)
    expect(invalidJson.body.error.code).toBe('DDL_INVALID_RENAMES')

    const invalidColumn = await getJson<ErrorBody>(
      context,
      `/api/projects/${id}/ddl?renames=${renamesQuery({ columns: { cpf: 'documento' } })}`,
    )
    expect(invalidColumn.response.status).toBe(400)
    expect(invalidColumn.body.error.code).toBe('DDL_INVALID_RENAMES')

    const tables = Object.fromEntries(
      Array.from({ length: 201 }, (_, index) => [`tabela_${index}`, `nova_${index}`]),
    )
    const exceeded = await getJson<ErrorBody>(
      context,
      `/api/projects/${id}/ddl?renames=${renamesQuery({ tables })}`,
    )
    expect(exceeded.response.status).toBe(400)
    expect(exceeded.body.error.code).toBe('DDL_INVALID_RENAMES')
  })

  test('projeto inexistente responde 404 nas rotas de geração e baseline', async () => {
    const generated = await getJson<ErrorBody>(context, '/api/projects/inexistente/ddl')
    expect(generated.response.status).toBe(404)
    expect(generated.body.error.code).toBe('NOT_FOUND')

    const read = await getJson<ErrorBody>(context, '/api/projects/inexistente/ddl/baseline')
    expect(read.response.status).toBe(404)
    expect(read.body.error.code).toBe('NOT_FOUND')

    const captured = await apiRequest<ErrorBody>(context, '/api/projects/inexistente/ddl/baseline', 'PUT')
    expect(captured.response.status).toBe(404)
    expect(captured.body.error.code).toBe('NOT_FOUND')
  })

  test('leitura do baseline devolve null sem baseline e o documento estrutural sem evento', async () => {
    const id = await seedProject(context, sampleDatabase())

    const before = ddlEvents(context)
    const empty = await getJson<BaselineReadBody>(context, `/api/projects/${id}/ddl/baseline`)
    expect(empty.response.status).toBe(200)
    expect(empty.body.baseline).toBeNull()
    expect(ddlEvents(context)).toHaveLength(before.length)

    await apiRequest(context, `/api/projects/${id}/ddl/baseline`, 'PUT')
    const stored = context.persistence.projects.readDdlBaseline(id)
    expect(stored).not.toBeNull()
    const eventsAfterCapture = ddlEvents(context)

    const read = await getJson<BaselineReadBody>(context, `/api/projects/${id}/ddl/baseline`)
    expect(read.response.status).toBe(200)
    expect(read.body.baseline).not.toBeNull()
    expect(read.body.baseline!.projectId).toBe(id)
    expect(read.body.baseline!.capturedAt).toBe(stored!.capturedAt)
    expect(read.body.baseline!.capturedBy).toBe(context.defaultUser.id)
    expect(read.body.baseline!.database.tables.map((table) => table.name)).toEqual(['cliente', 'pedido'])
    expect(read.body.baseline!.database).toEqual(stored!.database)
    expect(read.body.baseline!.database.tables[0].description).toBe('')
    expect(read.body.baseline!.database.tables[0].business_terms).toEqual([])
    expect(read.body.baseline!.database.tables[0].columns[0].description).toBe('')
    expect(read.body.baseline!.database.tables[0].columns[0].business_terms).toEqual([])
    expect(read.body.baseline!.database).not.toHaveProperty('table_ids')
    expect(read.body.baseline!.database.tables[0]).not.toHaveProperty('id')
    expect(read.body.baseline!.database.tables[0].columns[0]).not.toHaveProperty('id')

    expect(ddlEvents(context)).toHaveLength(eventsAfterCapture.length)
  })

  test('VIEWER não pode capturar baseline', async () => {
    const id = await seedProject(context, sampleDatabase())
    const viewer = await createUser(context, {
      email: 'viewer@example.com',
      password: 'viewer-password',
      role: 'VIEWER',
    })

    const response = await apiRequest<ErrorBody>(context, `/api/projects/${id}/ddl/baseline`, 'PUT', undefined, {
      cookie: viewer.cookie,
    })
    expect(response.response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(context.persistence.projects.readDdlBaseline(id)).toBeNull()
  })

  test('apply do import captura o baseline e emite ddl.baseline_captured', async () => {
    const id = await seedProject(context, sampleDatabase())
    const sql = 'CREATE TABLE produto (id int, nome text); CREATE TABLE categoria (id int);'

    const preview = await apiRequest<{ plan: ImportPlan }>(
      context,
      `/api/projects/${id}/imports/preview`,
      'POST',
      { sql },
    )
    expect(preview.response.status).toBe(200)

    const applied = await apiRequest(context, `/api/projects/${id}/imports/apply`, 'POST', {
      sql,
      plan: preview.body.plan,
    })
    expect(applied.response.status).toBe(200)

    const baseline = context.persistence.projects.readDdlBaseline(id)
    expect(baseline).not.toBeNull()
    expect(baseline!.database.tables.map((table) => table.name)).toEqual(['produto', 'categoria'])

    const produto = baseline!.database.tables.find((table) => table.name === 'produto')!
    expect(produto.columns.map((column) => column.name)).toEqual(['id', 'nome'])
    expect(produto.description).toBe('')
    expect(produto.columns[0].description).toBe('')

    const events = ddlEvents(context)
    expect(events).toHaveLength(1)
    expect(events[0].actorUserId).toBe(context.defaultUser.id)
    expect(events[0].subjectId).toBe(id)
    expect(events[0].payload.source).toBe('import')
  })

  test('apply que falha não captura baseline nem emite evento', async () => {
    const id = await seedProject(context, sampleDatabase())
    const sql = 'CREATE TABLE produto (id int);'
    const preview = await apiRequest<{ plan: ImportPlan }>(
      context,
      `/api/projects/${id}/imports/preview`,
      'POST',
      { sql },
    )

    const before = ddlEvents(context).length
    const applied = await apiRequest<ErrorBody>(context, `/api/projects/${id}/imports/apply`, 'POST', {
      sql: 'DROP TABLE cliente;',
      plan: preview.body.plan,
    })

    expect(applied.response.status).toBe(400)
    expect(applied.body.error.code).toBe('INVALID_SQL')
    expect(context.persistence.projects.readDdlBaseline(id)).toBeNull()
    expect(ddlEvents(context)).toHaveLength(before)
  })

  test('geração é somente leitura: não audita nem altera modelo, layout ou baseline', async () => {
    const id = await seedProject(context, sampleDatabase())
    await apiRequest(context, `/api/projects/${id}/diagram`, 'PUT', {
      positions: { cliente: { x: 10, y: 20 } },
      viewport: { x: 0, y: 0 },
      zoom: 1,
    })
    await apiRequest(context, `/api/projects/${id}/ddl/baseline`, 'PUT')

    const eventsBefore = context.persistence.agent.events.listAll().length
    const modelBefore = await getJson<{ database: DatabaseModel }>(context, `/api/projects/${id}/export`)
    const diagramBefore = await getJson<unknown>(context, `/api/projects/${id}/diagram`)
    const baselineBefore = context.persistence.projects.readDdlBaseline(id)

    const create = await getJson<DdlBody>(context, `/api/projects/${id}/ddl`)
    const migration = await getJson<DdlBody>(context, `/api/projects/${id}/ddl?mode=migration`)

    expect(create.response.status).toBe(200)
    expect(migration.response.status).toBe(200)
    expect(context.persistence.agent.events.listAll()).toHaveLength(eventsBefore)

    const modelAfter = await getJson<{ database: DatabaseModel }>(context, `/api/projects/${id}/export`)
    const diagramAfter = await getJson<unknown>(context, `/api/projects/${id}/diagram`)
    const baselineAfter = context.persistence.projects.readDdlBaseline(id)

    expect(modelAfter.body).toEqual(modelBefore.body)
    expect(diagramAfter.body).toEqual(diagramBefore.body)
    expect(baselineAfter).toEqual(baselineBefore)
  })
})
