import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { ApiClient } from './api'
import { createToolExecutor, type ToolExecutor } from './handlers'
import { createExecutorFromEnv } from './index'

const realFetch = globalThis.fetch

interface Call {
  url: string
  init?: RequestInit
}

const projectView = {
  id: 'p1',
  name: 'Loja',
  description: 'Banco da loja',
  reviewed: true,
  table_ids: { cliente: 't-cliente', pedido: 't-pedido' },
  column_ids: {
    cliente: { id: 'c-id', email: 'c-email' },
    pedido: { id: 'p-id' },
  },
  relationship_ids: { cliente: [], pedido: ['r-1'] },
  database: {
    name: 'Loja',
    description: 'Banco da loja',
    tables: [
      {
        name: 'cliente',
        description: 'Clientes',
        business_terms: ['cliente'],
        reviewed: true,
        status: 'UNCHANGED',
        columns: [
          {
            name: 'id',
            type: 'serial',
            primary_key: true,
            foreign_key: false,
            description: 'Identificador',
            business_terms: [],
            reviewed: true,
            status: 'UNCHANGED',
          },
          {
            name: 'email',
            type: 'text',
            primary_key: false,
            foreign_key: false,
            description: '',
            business_terms: [],
            reviewed: false,
            status: 'UNCHANGED',
          },
        ],
        relationships: { parents: [], children: [] },
      },
      {
        name: 'pedido',
        description: '',
        business_terms: [],
        reviewed: false,
        status: 'UNCHANGED',
        columns: [
          {
            name: 'id',
            type: 'serial',
            primary_key: true,
            foreign_key: false,
            description: '',
            business_terms: [],
            reviewed: false,
            status: 'UNCHANGED',
          },
        ],
        relationships: {
          parents: [
            {
              table: 'cliente',
              local_columns: ['cliente_id'],
              referenced_columns: ['id'],
              constraint_name: 'fk_pedido_cliente',
              description: '',
              reviewed: false,
            },
          ],
          children: [],
        },
      },
    ],
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function mockFetch(handler: (call: Call) => Response | Promise<Response>): Call[] {
  const calls: Call[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init }
    calls.push(call)
    return handler(call)
  }) as unknown as typeof fetch
  return calls
}

function parseToolText(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}

function configuredExecutor(): ToolExecutor {
  return createToolExecutor({
    client: new ApiClient({ baseUrl: 'http://api.test', apiKey: 'dbmp_test', projectId: 'p1' }),
  })
}

beforeEach(() => {
  globalThis.fetch = realFetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('executor das tools MCP', () => {
  test('get_project_overview resume cobertura e sugestões pendentes', async () => {
    const calls = mockFetch((call) => {
      if (call.url.includes('/agent/suggestions')) {
        return jsonResponse({ suggestions: [{ id: 's1' }, { id: 's2' }] })
      }
      return jsonResponse(projectView)
    })

    const result = await configuredExecutor()('get_project_overview', {})
    const body = parseToolText(result as { content: Array<{ text: string }> })

    expect(result.isError).toBeUndefined()
    expect(body.pendingSuggestions).toBe(2)
    expect(body.missingDescriptions).toBe(4)
    expect(body.coverage).toMatchObject({ totalItems: 6, describedItems: 2 })
    expect(calls.some((call) => call.url.includes('/agent/suggestions?status=pending'))).toBe(true)
  })

  test('list_missing_descriptions filtra por tabela', async () => {
    mockFetch(() => jsonResponse(projectView))
    const result = await configuredExecutor()('list_missing_descriptions', { table: 'cliente' })
    const body = parseToolText(result as { content: Array<{ text: string }> })

    const items = body.items as Array<{ itemType: string; itemId: string; table: string }>
    expect(items).toEqual([
      expect.objectContaining({ itemType: 'column', itemId: 'c-email', table: 'cliente' }),
    ])
  })

  test('list_missing_descriptions inclui tabela, coluna e relacionamento com IDs', async () => {
    mockFetch(() => jsonResponse(projectView))
    const result = await configuredExecutor()('list_missing_descriptions', { table: 'pedido' })
    const body = parseToolText(result as { content: Array<{ text: string }> })

    const items = body.items as Array<{ itemType: string; itemId: string }>
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemType: 'table', itemId: 't-pedido' }),
        expect.objectContaining({ itemType: 'column', itemId: 'p-id' }),
        expect.objectContaining({ itemType: 'relationship', itemId: 'r-1' }),
      ]),
    )
  })

  test('get_table devolve colunas e relacionamentos com IDs', async () => {
    mockFetch(() => jsonResponse(projectView))
    const result = await configuredExecutor()('get_table', { table: 'pedido' })
    const body = parseToolText(result as { content: Array<{ text: string }> })

    const table = body.table as {
      itemId: string
      columns: Array<{ itemId: string }>
      relationships: Array<{ itemId: string }>
    }
    expect(table.itemId).toBe('t-pedido')
    expect(table.columns[0].itemId).toBe('p-id')
    expect(table.relationships[0].itemId).toBe('r-1')
  })

  test('get_column devolve contexto de vizinhos', async () => {
    mockFetch(() => jsonResponse(projectView))
    const result = await configuredExecutor()('get_column', { table: 'cliente', column: 'email' })
    const body = parseToolText(result as { content: Array<{ text: string }> })

    expect((body.column as { itemId: string }).itemId).toBe('c-email')
    const neighbors = body.neighbors as Array<{ name: string; description: string }>
    expect(neighbors).toEqual([
      expect.objectContaining({ name: 'id', description: 'Identificador' }),
    ])
  })

  test('set_description usa PATCH com Bearer e devolve o aviso de não revisado', async () => {
    const calls = mockFetch(() =>
      jsonResponse({
        item: {
          itemType: 'column',
          itemId: 'c-email',
          description: 'Email do cliente',
          descriptionSource: 'mcp',
          reviewed: false,
          changed: true,
        },
      }),
    )

    const result = await configuredExecutor()('set_description', {
      itemType: 'column',
      itemId: 'c-email',
      description: 'Email do cliente',
    })
    const body = parseToolText(result as { content: Array<{ text: string }> })

    expect(result.isError).toBeUndefined()
    expect(body.warning).toContain('não revisado')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('http://api.test/api/projects/p1/items/column/c-email/description')
    expect(calls[0].init!.method).toBe('PATCH')
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ description: 'Email do cliente' })
    const headers = calls[0].init!.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer dbmp_test')
  })

  test('decisão de sugestão delega ao CAS e expõe 409 como erro da tool', async () => {
    mockFetch(() =>
      jsonResponse(
        { error: { code: 'SUGGESTION_CONFLICT', message: 'A sugestão não está mais pendente.', retryable: false } },
        409,
      ),
    )

    const result = await configuredExecutor()('apply_suggestion', { suggestionId: 's1' })
    expect(result.isError).toBe(true)
    const body = parseToolText(result as { content: Array<{ text: string }> })
    expect(body.error).toMatchObject({ code: 'SUGGESTION_CONFLICT', status: 409 })
  })

  test('validação local acontece antes de qualquer fetch', async () => {
    const calls = mockFetch(() => jsonResponse(projectView))

    const identity = await configuredExecutor()('set_description', {
      itemType: 'column',
      itemId: 'c-email',
      description: 'x',
      actorUserId: 'outro',
    })
    expect(identity.isError).toBe(true)
    expect(parseToolText(identity as { content: Array<{ text: string }> }).error).toMatchObject({
      code: 'VALIDATION_ERROR',
    })

    const missing = await configuredExecutor()('set_description', {
      itemType: 'column',
      itemId: 'c-email',
    })
    expect(missing.isError).toBe(true)
    expect(calls).toHaveLength(0)
  })

  test('configuração ausente responde MCP_CONFIG_ERROR em qualquer tool', async () => {
    const calls = mockFetch(() => jsonResponse(projectView))
    const result = await createExecutorFromEnv({})('list_missing_descriptions', { projectId: 'p1' })

    expect(result.isError).toBe(true)
    expect(parseToolText(result as { content: Array<{ text: string }> }).error).toMatchObject({
      code: 'MCP_CONFIG_ERROR',
    })
    expect(calls).toHaveLength(0)
  })

  test('resposta malformada não vaza o corpo bruto', async () => {
    mockFetch(() => new Response('<html>segredo-interno</html>', { status: 200 }))
    const result = await configuredExecutor()('get_export', {})
    const text = (result.content as Array<{ text: string }>)[0].text

    expect(result.isError).toBe(true)
    expect(text).not.toContain('segredo-interno')
  })

  test('projectId ausente e sem env vira erro de validação local', async () => {
    mockFetch(() => jsonResponse(projectView))
    const executor = createToolExecutor({
      client: new ApiClient({ baseUrl: 'http://api.test', apiKey: 'dbmp_test' }),
    })
    const result = await executor('get_export', {})

    expect(result.isError).toBe(true)
    expect(parseToolText(result as { content: Array<{ text: string }> }).error).toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })
})
