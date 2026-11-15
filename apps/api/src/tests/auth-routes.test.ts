import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { apiRequest, createTestContext, DEFAULT_TEST_USER, getJson, type TestContext } from './helpers'

interface AuthUserBody {
  id: string
  email: string
  role: string
}

interface ErrorBody {
  error: { code: string; message: string; retryable: boolean }
}

describe('auth: rotas de login, me e logout', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('login válido define cookie HttpOnly e não expõe o hash', async () => {
    const { response, body } = await apiRequest<AuthUserBody>(
      context,
      '/api/auth/login',
      'POST',
      { email: DEFAULT_TEST_USER.email, password: DEFAULT_TEST_USER.password },
      { cookie: null },
    )

    expect(response.status).toBe(200)
    expect(body).toEqual({
      id: context.defaultUser.id,
      email: DEFAULT_TEST_USER.email,
      role: 'MEMBER',
    })

    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('session=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Max-Age=86400')
    expect(JSON.stringify(body)).not.toContain('passwordHash')
    expect(JSON.stringify(body)).not.toContain('$2b$')
  })

  test('senha errada e email desconhecido retornam o mesmo 401 genérico', async () => {
    const wrongPassword = await apiRequest<ErrorBody>(
      context,
      '/api/auth/login',
      'POST',
      { email: DEFAULT_TEST_USER.email, password: 'senha-errada' },
      { cookie: null },
    )
    const unknownEmail = await apiRequest<ErrorBody>(
      context,
      '/api/auth/login',
      'POST',
      { email: 'ninguem@example.com', password: 'qualquer' },
      { cookie: null },
    )

    expect(wrongPassword.response.status).toBe(401)
    expect(unknownEmail.response.status).toBe(401)
    expect(wrongPassword.body).toEqual(unknownEmail.body)
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  test('me exige sessão válida', async () => {
    const authenticated = await getJson<AuthUserBody>(context, '/api/auth/me')
    expect(authenticated.response.status).toBe(200)
    expect(authenticated.body).toEqual({
      id: context.defaultUser.id,
      email: DEFAULT_TEST_USER.email,
      role: 'MEMBER',
    })

    const missing = await getJson<ErrorBody>(context, '/api/auth/me', { cookie: null })
    expect(missing.response.status).toBe(401)
    expect(missing.body.error.code).toBe('UNAUTHORIZED')

    const tampered = await getJson<ErrorBody>(context, '/api/auth/me', { cookie: 'session=token-invalido' })
    expect(tampered.response.status).toBe(401)
    expect(tampered.body.error.code).toBe('UNAUTHORIZED')
  })

  test('logout limpa o cookie e a sessão deixa de autenticar', async () => {
    const logout = await apiRequest<{ status: string }>(context, '/api/auth/logout', 'POST')
    expect(logout.response.status).toBe(200)
    expect(logout.response.headers.get('set-cookie')).toContain('Max-Age=0')

    const after = await getJson<ErrorBody>(context, '/api/auth/me', { cookie: null })
    expect(after.response.status).toBe(401)
  })

  test('bloqueia após 5 falhas com 429 e Retry-After; sucesso zera o contador', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await apiRequest<ErrorBody>(
        context,
        '/api/auth/login',
        'POST',
        { email: DEFAULT_TEST_USER.email, password: 'senha-errada' },
        { cookie: null },
      )
      expect(failed.response.status).toBe(401)
    }

    const blocked = await apiRequest<ErrorBody>(
      context,
      '/api/auth/login',
      'POST',
      { email: DEFAULT_TEST_USER.email, password: DEFAULT_TEST_USER.password },
      { cookie: null },
    )
    expect(blocked.response.status).toBe(429)
    expect(blocked.body.error.code).toBe('TOO_MANY_ATTEMPTS')
    expect(Number(blocked.response.headers.get('retry-after'))).toBeGreaterThan(0)

    const other = await apiRequest<ErrorBody>(
      context,
      '/api/auth/login',
      'POST',
      { email: 'outro@example.com', password: 'senha-errada' },
      { cookie: null },
    )
    expect(other.response.status).toBe(401)

    const successContext = await createTestContext({
      user: { email: 'reset@example.com', password: 'segredo', role: 'MEMBER' },
    })
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await apiRequest(
          successContext,
          '/api/auth/login',
          'POST',
          { email: 'reset@example.com', password: 'errada' },
          { cookie: null },
        )
      }
      const success = await apiRequest<AuthUserBody>(
        successContext,
        '/api/auth/login',
        'POST',
        { email: 'reset@example.com', password: 'segredo' },
        { cookie: null },
      )
      expect(success.response.status).toBe(200)

      const afterReset = await apiRequest<ErrorBody>(
        successContext,
        '/api/auth/login',
        'POST',
        { email: 'reset@example.com', password: 'errada' },
        { cookie: null },
      )
      expect(afterReset.response.status).toBe(401)
    } finally {
      await successContext.cleanup()
    }
  }, 20_000)
})
