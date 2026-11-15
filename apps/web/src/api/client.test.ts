import { afterEach, describe, expect, test } from 'bun:test'
import { errorResponse, installFetch, jsonResponse } from '../test/fetch'
import { ApiError, request } from './client'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
})

describe('api/client', () => {
  test('parseia resposta de sucesso e envia credentials include', async () => {
    let capturedInit: RequestInit | undefined

    restoreCallbacks.push(
      installFetch((url, init) => {
        expect(url).toBe('/api/health')
        capturedInit = init
        return jsonResponse({ status: 'ok' })
      }),
    )

    const body = await request<{ status: string }>('/api/health')

    expect(body).toEqual({ status: 'ok' })
    expect(capturedInit?.credentials).toBe('include')
    expect(new Headers(capturedInit?.headers).get('accept')).toBe('application/json')
  })

  test('converte o envelope de erro em ApiError com code, message, retryable e details', async () => {
    restoreCallbacks.push(
      installFetch(() =>
        errorResponse('INVALID_CREDENTIALS', 'Credenciais inválidas.', 401, {
          retryable: false,
          details: { attempt: 1 },
        }),
      ),
    )

    let caught: unknown
    try {
      await request('/api/auth/login', { method: 'POST' })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ApiError)
    const apiError = caught as ApiError
    expect(apiError.status).toBe(401)
    expect(apiError.code).toBe('INVALID_CREDENTIALS')
    expect(apiError.message).toBe('Credenciais inválidas.')
    expect(apiError.retryable).toBe(false)
    expect(apiError.details).toEqual({ attempt: 1 })
  })

  test('usa erro genérico quando o corpo não é um envelope da API', async () => {
    restoreCallbacks.push(installFetch(() => new Response('gateway down', { status: 502 })))

    let caught: unknown
    try {
      await request('/api/projects')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).code).toBe('UNKNOWN_ERROR')
    expect((caught as ApiError).status).toBe(502)
  })
})
