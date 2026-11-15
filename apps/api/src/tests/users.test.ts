import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { apiRequest, createTestContext, createUser, getJson, type TestContext } from './helpers'

interface UserBody {
  id: string
  email: string
  role: string
}

interface ErrorBody {
  error: { code: string; message: string; retryable: boolean }
}

const ADMIN = { email: 'admin@example.com', password: 'admin-password', role: 'ADMIN' as const }

describe('auth: administração de usuários', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext({ user: ADMIN })
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('ADMIN cria, lista e altera papel sem expor password_hash', async () => {
    const created = await apiRequest<UserBody>(context, '/api/users', 'POST', {
      email: 'Novo@Example.com',
      password: 'senha-forte',
      role: 'MEMBER',
    })

    expect(created.response.status).toBe(201)
    expect(created.body).toMatchObject({ email: 'novo@example.com', role: 'MEMBER' })
    expect(JSON.stringify(created.body)).not.toContain('passwordHash')
    expect(JSON.stringify(created.body)).not.toContain('$2b$')

    const stored = context.persistence.users.findByEmail('novo@example.com')!
    expect(stored.passwordHash).not.toBe('senha-forte')
    expect(stored.passwordHash.startsWith('$2b$')).toBe(true)

    const list = await getJson<UserBody[]>(context, '/api/users')
    expect(list.response.status).toBe(200)
    expect(list.body.map((user) => user.email)).toEqual(['admin@example.com', 'novo@example.com'])
    expect(JSON.stringify(list.body)).not.toContain('passwordHash')

    const updated = await apiRequest<UserBody>(context, `/api/users/${created.body.id}`, 'PATCH', {
      role: 'VIEWER',
    })
    expect(updated.response.status).toBe(200)
    expect(updated.body.role).toBe('VIEWER')
    expect(context.persistence.users.findById(created.body.id)!.role).toBe('VIEWER')
  })

  test('valida email duplicado e senha curta', async () => {
    const duplicate = await apiRequest<ErrorBody>(context, '/api/users', 'POST', {
      email: ADMIN.email,
      password: 'senha-forte',
      role: 'MEMBER',
    })
    expect(duplicate.response.status).toBe(409)
    expect(duplicate.body.error.code).toBe('EMAIL_ALREADY_EXISTS')

    const shortPassword = await apiRequest<ErrorBody>(context, '/api/users', 'POST', {
      email: 'curta@example.com',
      password: '123',
      role: 'MEMBER',
    })
    expect(shortPassword.response.status).toBe(400)
    expect(shortPassword.body.error.code).toBe('VALIDATION_ERROR')
    expect(context.persistence.users.findByEmail('curta@example.com')).toBeNull()
  })

  test('MEMBER e VIEWER recebem 403 em qualquer endpoint de usuários', async () => {
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
      const list = await getJson<ErrorBody>(context, '/api/users', { cookie })
      expect(list.response.status).toBe(403)
      expect(list.body.error.code).toBe('FORBIDDEN')

      const create = await apiRequest<ErrorBody>(
        context,
        '/api/users',
        'POST',
        { email: 'x@example.com', password: 'senha-forte', role: 'MEMBER' },
        { cookie },
      )
      expect(create.response.status).toBe(403)

      const patch = await apiRequest<ErrorBody>(
        context,
        `/api/users/${member.user.id}`,
        'PATCH',
        { role: 'VIEWER' },
        { cookie },
      )
      expect(patch.response.status).toBe(403)
    }
  })

  test('não permite rebaixar o último ADMIN e mantém o papel', async () => {
    const demote = await apiRequest<ErrorBody>(context, `/api/users/${context.defaultUser.id}`, 'PATCH', {
      role: 'MEMBER',
    })

    expect(demote.response.status).toBe(400)
    expect(demote.body.error.code).toBe('LAST_ADMIN')
    expect(context.persistence.users.findById(context.defaultUser.id)!.role).toBe('ADMIN')

    const secondAdmin = await createUser(context, {
      email: 'admin2@example.com',
      password: 'admin2-password',
      role: 'ADMIN',
    })
    const allowed = await apiRequest<UserBody>(context, `/api/users/${context.defaultUser.id}`, 'PATCH', {
      role: 'MEMBER',
    })
    expect(allowed.response.status).toBe(200)
    expect(allowed.body.role).toBe('MEMBER')
    expect(context.persistence.users.findById(secondAdmin.user.id)!.role).toBe('ADMIN')
  })
})
