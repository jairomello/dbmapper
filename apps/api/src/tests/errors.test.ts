import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { apiRequest, createTestContext, getJson, type TestContext } from './helpers'

interface ErrorBody {
  error: {
    code: string
    message: string
    retryable: boolean
    details?: { issues?: unknown[] }
  }
}

describe('envelope de erro', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('falha de validação retorna o envelope sanitizado', async () => {
    const { response, body } = await apiRequest<ErrorBody>(context, '/api/projects', 'POST', {})

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toBeTruthy()
    expect(body.error.retryable).toBe(false)
    expect(body.error.details?.issues).toBeTruthy()

    const raw = JSON.stringify(body)
    expect(raw).not.toContain('stack')
    expect(raw).not.toContain('SELECT')
  })

  test('JSON inválido retorna INVALID_JSON', async () => {
    const response = await context.app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid',
    })
    const body = (await response.json()) as ErrorBody

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('INVALID_JSON')
    expect(body.error.retryable).toBe(false)
  })

  test('rota inexistente retorna 404 com envelope', async () => {
    const { response, body } = await getJson<ErrorBody>(context, '/api/unknown')

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.retryable).toBe(false)
  })
})
