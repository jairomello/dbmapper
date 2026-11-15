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

describe('auth: proteção das rotas', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('sem sessão qualquer rota protegida responde 401 sem alterar dados', async () => {
    const list = await getJson<ErrorBody>(context, '/api/projects', { cookie: null })
    expect(list.response.status).toBe(401)
    expect(list.body.error.code).toBe('UNAUTHORIZED')

    const create = await apiRequest<ErrorBody>(context, '/api/projects', 'POST', { name: 'Invasor' }, { cookie: null })
    expect(create.response.status).toBe(401)

    const again = await getJson<Array<{ id: string }>>(context, '/api/projects')
    expect(again.body).toEqual([])
  })

  test('VIEWER lê mas não pode criar, salvar, preview nem apply', async () => {
    const viewer = await createUser(context, {
      email: 'viewer@example.com',
      password: 'viewer-password',
      role: 'VIEWER',
    })
    const projectId = await seedProject(context, sampleDatabase())

    const read = await getJson<Array<{ id: string }>>(context, '/api/projects', { cookie: viewer.cookie })
    expect(read.response.status).toBe(200)
    expect(read.body.map((project) => project.id)).toEqual([projectId])

    const exported = await getJson<{ database: unknown }>(context, `/api/projects/${projectId}/export`, {
      cookie: viewer.cookie,
    })
    expect(exported.response.status).toBe(200)

    const database = sampleDatabase()
    database.description = 'Tentativa do viewer'

    const save = await apiRequest<ErrorBody>(
      context,
      `/api/projects/${projectId}`,
      'PUT',
      { database },
      { cookie: viewer.cookie },
    )
    expect(save.response.status).toBe(403)
    expect(save.body.error.code).toBe('FORBIDDEN')

    const preview = await apiRequest<ErrorBody>(
      context,
      `/api/projects/${projectId}/imports/preview`,
      'POST',
      { sql: 'CREATE TABLE produto (id int);' },
      { cookie: viewer.cookie },
    )
    expect(preview.response.status).toBe(403)

    const apply = await apiRequest<ErrorBody>(
      context,
      `/api/projects/${projectId}/imports/apply`,
      'POST',
      { sql: 'CREATE TABLE produto (id int);', plan: {} },
      { cookie: viewer.cookie },
    )
    expect(apply.response.status).toBe(403)

    const createViewer = await apiRequest<ErrorBody>(
      context,
      '/api/projects',
      'POST',
      { name: 'Novo' },
      { cookie: viewer.cookie },
    )
    expect(createViewer.response.status).toBe(403)

    const reloaded = await getJson<{ description: string }>(context, `/api/projects/${projectId}`)
    expect(reloaded.body.description).toBe('Banco da loja')
  })
})
