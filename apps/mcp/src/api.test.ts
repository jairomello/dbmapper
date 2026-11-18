import { afterEach, describe, expect, test } from 'bun:test'
import { ApiClient, ApiError, resolveConfig } from './api'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('configuração do MCP', () => {
  test('exige DBMAPPER_API_KEY e DBMAPPER_URL', () => {
    expect(resolveConfig({}).ok).toBe(false)
    expect(resolveConfig({ DBMAPPER_API_KEY: 'dbmp_x' }).ok).toBe(false)
    expect(resolveConfig({ DBMAPPER_URL: 'http://localhost:3000' }).ok).toBe(false)
  })

  test('rejeita URL inválida e normaliza a barra final', () => {
    expect(
      resolveConfig({ DBMAPPER_API_KEY: 'dbmp_x', DBMAPPER_URL: 'ftp://example.com' }).ok,
    ).toBe(false)
    expect(
      resolveConfig({ DBMAPPER_API_KEY: 'dbmp_x', DBMAPPER_URL: 'não é url' }).ok,
    ).toBe(false)

    const resolved = resolveConfig({
      DBMAPPER_API_KEY: 'dbmp_x',
      DBMAPPER_URL: 'http://localhost:3000/',
      DBMAPPER_PROJECT_ID: 'p1',
    })
    expect(resolved).toEqual({
      ok: true,
      config: { baseUrl: 'http://localhost:3000', apiKey: 'dbmp_x', projectId: 'p1' },
    })
  })
})

describe('cliente REST do MCP', () => {
  test('envia Bearer e devolve o JSON de sucesso', async () => {
    let captured: { url: string; init?: RequestInit } | null = null
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), init }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const client = new ApiClient({ baseUrl: 'http://api.test', apiKey: 'dbmp_secret' })
    const result = await client.request<{ ok: boolean }>('GET', '/api/projects/p1')

    expect(result).toEqual({ ok: true })
    expect(captured).not.toBeNull()
    expect(captured!.url).toBe('http://api.test/api/projects/p1')
    const headers = captured!.init!.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer dbmp_secret')
  })

  test('converte o envelope de erro sem ecoar o corpo bruto', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Sem permissão', retryable: false } }), {
        status: 403,
      })) as unknown as typeof fetch

    const client = new ApiClient({ baseUrl: 'http://api.test', apiKey: 'dbmp_secret' })

    try {
      await client.request('GET', '/api/projects/p1')
      throw new Error('deveria falhar')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      const apiError = error as ApiError
      expect(apiError.status).toBe(403)
      expect(apiError.code).toBe('FORBIDDEN')
      expect(apiError.message).toBe('Sem permissão')
    }
  })

  test('resposta não-JSON vira erro seguro e genérico', async () => {
    globalThis.fetch = (async () =>
      new Response('<html>conteudo-interno</html>', { status: 500 })) as unknown as typeof fetch

    const client = new ApiClient({ baseUrl: 'http://api.test', apiKey: 'dbmp_secret' })

    try {
      await client.request('GET', '/api/projects/p1')
      throw new Error('deveria falhar')
    } catch (error) {
      const apiError = error as ApiError
      expect(apiError).toBeInstanceOf(ApiError)
      expect(apiError.code).toBe('API_ERROR')
      expect(apiError.message).not.toContain('conteudo-interno')
    }
  })

  test('falha de rede vira erro retryable', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch

    const client = new ApiClient({ baseUrl: 'http://api.test', apiKey: 'dbmp_secret' })

    try {
      await client.request('GET', '/api/projects/p1')
      throw new Error('deveria falhar')
    } catch (error) {
      const apiError = error as ApiError
      expect(apiError.code).toBe('NETWORK_ERROR')
      expect(apiError.retryable).toBe(true)
    }
  })
})
