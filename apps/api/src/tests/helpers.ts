import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseModel } from '@dbmapper/domain'
import type { Hono } from 'hono'
import { createApp } from '../app'
import type { Persistence } from '../persistence/ports'
import { createSqlitePersistence } from '../persistence/sqlite/adapter'

export interface TestContext {
  app: Hono
  persistence: Persistence
  cleanup(): Promise<void>
}

export async function createTestContext(): Promise<TestContext> {
  const directory = await mkdtemp(join(tmpdir(), 'dbmapper-api-'))
  const persistence = createSqlitePersistence(join(directory, 'test.db'), { migrate: true })
  const app = createApp(persistence)

  return {
    app,
    persistence,
    async cleanup() {
      persistence.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

export interface ApiResponse<T> {
  response: Response
  body: T
}

export async function apiRequest<T>(
  context: TestContext,
  path: string,
  method: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(body)
  }

  const response = await context.app.request(path, init)
  const text = await response.text()
  return {
    response,
    body: (text ? JSON.parse(text) : null) as T,
  }
}

export async function getJson<T>(context: TestContext, path: string): Promise<ApiResponse<T>> {
  return apiRequest<T>(context, path, 'GET')
}

export async function seedProject(context: TestContext, database: DatabaseModel): Promise<string> {
  const created = await apiRequest<{ id: string }>(context, '/api/projects', 'POST', {
    name: database.name,
    description: database.description,
  })
  if (created.response.status !== 201) throw new Error(`Falha ao criar projeto: ${created.response.status}`)

  const saved = await apiRequest(context, `/api/projects/${created.body.id}`, 'PUT', { database })
  if (saved.response.status !== 200) throw new Error(`Falha ao salvar projeto: ${saved.response.status}`)

  return created.body.id
}

export function sampleDatabase(): DatabaseModel {
  return {
    name: 'Loja',
    description: 'Banco da loja',
    business_terms: ['venda', 'cliente'],
    reviewed: false,
    tables: [
      {
        name: 'cliente',
        description: 'Cadastro de clientes',
        business_terms: ['cliente'],
        reviewed: true,
        status: 'UNCHANGED',
        relationships: { parents: [], children: [] },
        columns: [
          {
            name: 'id',
            type: 'serial',
            primary_key: true,
            foreign_key: false,
            description: 'Identificador do cliente',
            business_terms: ['identificador'],
            reviewed: true,
            status: 'UNCHANGED',
          },
        ],
      },
      {
        name: 'pedido',
        description: 'Pedidos de venda',
        business_terms: ['venda'],
        reviewed: false,
        status: 'UNCHANGED',
        relationships: {
          parents: [
            {
              table: 'cliente',
              local_columns: ['cliente_id'],
              referenced_columns: ['id'],
              constraint_name: 'fk_pedido_cliente',
              description: 'Pedido pertence ao cliente',
              reviewed: false,
            },
          ],
          children: [],
        },
        columns: [
          {
            name: 'id',
            type: 'serial',
            primary_key: true,
            foreign_key: false,
            description: 'Identificador do pedido',
            business_terms: ['identificador'],
            reviewed: true,
            status: 'UNCHANGED',
          },
          {
            name: 'cliente_id',
            type: 'int',
            primary_key: false,
            foreign_key: true,
            description: 'Cliente do pedido',
            business_terms: [],
            reviewed: false,
            status: 'UNCHANGED',
          },
        ],
      },
    ],
  }
}
