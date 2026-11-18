import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { KEY_ENABLED, isKeyEnabled } from '../middleware/credential'
import { displayPrefix, generateApiKey, hashApiKey } from '../services/api-keys'
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
}

async function createKey(
  context: TestContext,
  options: { projectScope?: string | null; ownerId?: string } = {},
): Promise<string> {
  const plaintext = generateApiKey()
  context.persistence.apiKeys.create({
    ownerId: options.ownerId ?? context.defaultUser.id,
    name: 'teste',
    keyHash: hashApiKey(plaintext),
    keyPrefix: displayPrefix(plaintext),
    projectScope: options.projectScope ?? null,
  })
  return plaintext
}

describe('credencial Bearer', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('KEY_ENABLED fixa a superfície exata da chave', () => {
    expect(KEY_ENABLED).toHaveLength(4)

    expect(isKeyEnabled('GET', '/api/projects/p1')).toBe(true)
    expect(isKeyEnabled('GET', '/api/projects/p1/export')).toBe(true)
    expect(isKeyEnabled('GET', '/api/projects/p1/agent/suggestions')).toBe(true)
    expect(isKeyEnabled('POST', '/api/projects/p1/agent/suggestions/s1/apply')).toBe(true)
    expect(isKeyEnabled('PATCH', '/api/projects/p1/items/column/c1/description')).toBe(true)

    expect(isKeyEnabled('GET', '/api/projects')).toBe(false)
    expect(isKeyEnabled('POST', '/api/keys')).toBe(false)
    expect(isKeyEnabled('POST', '/api/users')).toBe(false)
    expect(isKeyEnabled('GET', '/api/auth/me')).toBe(false)
    expect(isKeyEnabled('PUT', '/api/projects/p1')).toBe(false)
    expect(isKeyEnabled('GET', '/api/projects/p1/imports')).toBe(false)
  })

  test('chave válida autentica como o dono e atualiza last_used_at', async () => {
    const projectId = await seedProject(context, sampleDatabase())
    const key = await createKey(context)

    const response = await getJson<ProjectBody>(context, `/api/projects/${projectId}`, {
      cookie: null,
      bearer: key,
    })
    expect(response.response.status).toBe(200)

    const stored = context.persistence.apiKeys.findByHash(hashApiKey(key))
    expect(stored!.lastUsedAt).not.toBeNull()
  })

  test('chave inválida e rota de sessão pura são rejeitadas', async () => {
    const projectId = await seedProject(context, sampleDatabase())

    const invalid = await getJson<ErrorBody>(context, `/api/projects/${projectId}`, {
      cookie: null,
      bearer: 'dbmp_invalida',
    })
    expect(invalid.response.status).toBe(401)
    expect(invalid.body.error.code).toBe('INVALID_API_KEY')

    const key = await createKey(context)
    const sessionOnly = await apiRequest<ErrorBody>(
      context,
      '/api/users',
      'POST',
      { email: 'x@example.com', password: 'senha-forte', role: 'MEMBER' },
      { cookie: null, bearer: key },
    )
    expect(sessionOnly.response.status).toBe(401)
    expect(sessionOnly.body.error.code).toBe('UNAUTHORIZED')
  })

  test('escopo de projeto confina a chave sem vazar existência', async () => {
    const projectA = await seedProject(context, sampleDatabase())
    const projectB = await seedProject(context, { ...sampleDatabase(), name: 'Outra' })
    const key = await createKey(context, { projectScope: projectA })

    const own = await getJson<ProjectBody>(context, `/api/projects/${projectA}`, {
      cookie: null,
      bearer: key,
    })
    expect(own.response.status).toBe(200)

    const foreign = await getJson<ErrorBody>(context, `/api/projects/${projectB}`, {
      cookie: null,
      bearer: key,
    })
    expect(foreign.response.status).toBe(403)
    expect(foreign.body.error.code).toBe('FORBIDDEN')

    const missing = await getJson<ErrorBody>(context, '/api/projects/nao-existe', {
      cookie: null,
      bearer: key,
    })
    expect(missing.response.status).toBe(403)
    expect(missing.body.error.code).toBe('FORBIDDEN')
  })

  test('chave sem escopo segue o dono', async () => {
    const projectA = await seedProject(context, sampleDatabase())
    const projectB = await seedProject(context, { ...sampleDatabase(), name: 'Outra' })
    const key = await createKey(context)

    for (const projectId of [projectA, projectB]) {
      const response = await getJson<ProjectBody>(context, `/api/projects/${projectId}`, {
        cookie: null,
        bearer: key,
      })
      expect(response.response.status).toBe(200)
    }
  })

  test('papel vem do dono: chave de VIEWER não escreve', async () => {
    const viewer = await createUser(context, {
      email: 'viewer@example.com',
      password: 'viewer-password',
      role: 'VIEWER',
    })
    const projectId = await seedProject(context, sampleDatabase())
    const project = await getJson<ProjectBody>(context, `/api/projects/${projectId}`)
    const columnId = project.body.column_ids.cliente.id
    const key = await createKey(context, { ownerId: viewer.user.id })

    const write = await apiRequest<ErrorBody>(
      context,
      `/api/projects/${projectId}/items/column/${columnId}/description`,
      'PATCH',
      { description: 'Tentativa do viewer' },
      { cookie: null, bearer: key },
    )
    expect(write.response.status).toBe(403)
    expect(write.body.error.code).toBe('FORBIDDEN')
  })

  test('identidade do corpo é ignorada e a auditoria usa o dono da chave', async () => {
    const other = await createUser(context, {
      email: 'other@example.com',
      password: 'other-password',
      role: 'MEMBER',
    })
    const projectId = await seedProject(context, sampleDatabase())
    const project = await getJson<ProjectBody>(context, `/api/projects/${projectId}`)
    const columnId = project.body.column_ids.pedido.cliente_id
    const key = await createKey(context)

    const write = await apiRequest<{ item: { itemId: string } }>(
      context,
      `/api/projects/${projectId}/items/column/${columnId}/description`,
      'PATCH',
      { description: 'Cliente do pedido via MCP', actorUserId: other.user.id, userId: other.user.id },
      { cookie: null, bearer: key },
    )
    expect(write.response.status).toBe(200)

    const event = context.persistence.agent.events
      .list(projectId)
      .find((row) => row.action === 'item.description_written')
    expect(event).toBeDefined()
    expect(event!.actorUserId).toBe(context.defaultUser.id)
    expect(event!.actorUserId).not.toBe(other.user.id)
  })
})
