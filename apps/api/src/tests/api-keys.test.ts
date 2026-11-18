import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { hashApiKey } from '../services/api-keys'
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

interface KeyView {
  id: string
  name: string
  keyPrefix: string
  projectScope: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  lastUsedAt: string | null
  status: 'active' | 'expired' | 'revoked'
}

interface CreateKeyBody {
  key: string
  apiKey: KeyView
}

interface ListKeysBody {
  keys: KeyView[]
}

async function createKey(
  context: TestContext,
  options: { name?: string; projectScope?: string | null; cookie?: string } = {},
): Promise<CreateKeyBody> {
  const response = await apiRequest<CreateKeyBody>(
    context,
    '/api/keys',
    'POST',
    { name: options.name ?? 'opencode', projectScope: options.projectScope ?? null },
    options.cookie ? { cookie: options.cookie } : {},
  )
  expect(response.response.status).toBe(201)
  return response.body
}

describe('API keys', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('POST devolve o texto puro uma única vez e persiste apenas o hash', async () => {
    const created = await createKey(context)
    expect(created.key.startsWith('dbmp_')).toBe(true)
    expect(created.apiKey.keyPrefix).toBe(created.key.slice(0, 13))

    const persisted = context.persistence.apiKeys.findByHash(hashApiKey(created.key))
    expect(persisted).not.toBeNull()
    expect(persisted!.keyHash).not.toBe(created.key)

    const list = await getJson<ListKeysBody>(context, '/api/keys')
    expect(list.response.status).toBe(200)
    expect(list.body.keys).toHaveLength(1)
    expect(list.body.keys[0].keyPrefix).toBe(created.apiKey.keyPrefix)
    expect(JSON.stringify(list.body)).not.toContain(created.key)
    expect(JSON.stringify(list.body)).not.toContain(persisted!.keyHash)
  })

  test('VIEWER não cria chaves', async () => {
    const viewer = await createUser(context, {
      email: 'viewer@example.com',
      password: 'viewer-password',
      role: 'VIEWER',
    })

    const response = await apiRequest<ErrorBody>(
      context,
      '/api/keys',
      'POST',
      { name: 'viewer-key' },
      { cookie: viewer.cookie },
    )
    expect(response.response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
  })

  test('revogação vale imediatamente e chave de outro usuário fica invisível', async () => {
    const projectId = await seedProject(context, sampleDatabase())
    const created = await createKey(context)
    const other = await createUser(context, {
      email: 'other@example.com',
      password: 'other-password',
      role: 'MEMBER',
    })

    const foreign = await apiRequest<ErrorBody>(
      context,
      `/api/keys/${created.apiKey.id}`,
      'DELETE',
      undefined,
      { cookie: other.cookie },
    )
    expect(foreign.response.status).toBe(404)
    expect(foreign.body.error.code).toBe('NOT_FOUND')
    expect(context.persistence.apiKeys.findByHash(hashApiKey(created.key))).not.toBeNull()

    const beforeRevoke = await getJson<{ id: string }>(context, `/api/projects/${projectId}`, {
      cookie: null,
      bearer: created.key,
    })
    expect(beforeRevoke.response.status).toBe(200)

    const revoked = await apiRequest<{ apiKey: KeyView }>(
      context,
      `/api/keys/${created.apiKey.id}`,
      'DELETE',
    )
    expect(revoked.response.status).toBe(200)
    expect(revoked.body.apiKey.status).toBe('revoked')

    const afterRevoke = await getJson<ErrorBody>(context, `/api/projects/${projectId}`, {
      cookie: null,
      bearer: created.key,
    })
    expect(afterRevoke.response.status).toBe(401)
    expect(afterRevoke.body.error.code).toBe('INVALID_API_KEY')
  })

  test('criação e revogação são auditadas', async () => {
    const created = await createKey(context)
    await apiRequest(context, `/api/keys/${created.apiKey.id}`, 'DELETE')

    const events = context.persistence.agent.events.listAll()
    const createdEvent = events.find((event) => event.action === 'api_key.created')
    const revokedEvent = events.find((event) => event.action === 'api_key.revoked')

    expect(createdEvent).toBeDefined()
    expect(createdEvent!.actorUserId).toBe(context.defaultUser.id)
    expect(createdEvent!.subjectId).toBe(created.apiKey.id)
    expect(createdEvent!.payload).toMatchObject({ keyPrefix: created.apiKey.keyPrefix })

    expect(revokedEvent).toBeDefined()
    expect(revokedEvent!.actorUserId).toBe(context.defaultUser.id)
    expect(revokedEvent!.subjectId).toBe(created.apiKey.id)
  })

  test('chave expirada é rejeitada', async () => {
    const projectId = await seedProject(context, sampleDatabase())
    const response = await apiRequest<CreateKeyBody>(context, '/api/keys', 'POST', {
      name: 'expirada',
      expiresAt: '2000-01-01T00:00:00.000Z',
    })
    expect(response.response.status).toBe(201)
    expect(response.body.apiKey.status).toBe('expired')

    const rejected = await getJson<ErrorBody>(context, `/api/projects/${projectId}`, {
      cookie: null,
      bearer: response.body.key,
    })
    expect(rejected.response.status).toBe(401)
    expect(rejected.body.error.code).toBe('INVALID_API_KEY')
  })
})
