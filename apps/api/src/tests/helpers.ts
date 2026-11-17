import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseModel } from '@dbmapper/domain'
import type { Hono } from 'hono'
import type { AgentAppOptions } from '../app'
import { createApp } from '../app'
import type { Persistence, UserRecord, UserRole } from '../persistence/ports'
import { createSqlitePersistence } from '../persistence/sqlite/adapter'
import { buildSessionCookie, hashPassword, signJwt, toJwtPayload, type AuthConfig } from '../services/auth'
import type { AppEnv } from '../types'

export const TEST_JWT_SECRET = 'dbmapper-test-secret'
const TEST_AUTH: AuthConfig = {
  secret: TEST_JWT_SECRET,
  sessionTtlSeconds: 24 * 60 * 60,
  renewAfterSeconds: 12 * 60 * 60,
}

export const DEFAULT_TEST_USER = {
  email: 'tester@example.com',
  password: 'tester-password',
  role: 'MEMBER' as UserRole,
}

export interface TestContext {
  app: Hono<AppEnv>
  persistence: Persistence
  cookie: string
  defaultUser: UserRecord
  cleanup(): Promise<void>
}

export async function createSessionCookie(user: Pick<UserRecord, 'id' | 'email' | 'role'>): Promise<string> {
  const token = await signJwt(toJwtPayload(user), TEST_JWT_SECRET, TEST_AUTH.sessionTtlSeconds)
  return buildSessionCookie(token, TEST_AUTH.sessionTtlSeconds)
}

export async function createUser(
  context: TestContext,
  options: { email: string; password: string; role: UserRole },
): Promise<{ user: UserRecord; cookie: string }> {
  const user = context.persistence.users.create({
    email: options.email.trim().toLowerCase(),
    passwordHash: await hashPassword(options.password),
    role: options.role,
  })
  return { user, cookie: await createSessionCookie(user) }
}

export interface TestContextOptions {
  user?: { email: string; password: string; role: UserRole }
  agent?: AgentAppOptions
}

export async function createTestContext(options: TestContextOptions = {}): Promise<TestContext> {
  const directory = await mkdtemp(join(tmpdir(), 'dbmapper-api-'))
  const persistence = createSqlitePersistence(join(directory, 'test.db'), { migrate: true })
  const app = createApp(persistence, { auth: TEST_AUTH, agent: options.agent })

  const seed = options.user ?? DEFAULT_TEST_USER
  const defaultUser = persistence.users.create({
    email: seed.email,
    passwordHash: await hashPassword(seed.password),
    role: seed.role,
  })
  const cookie = await createSessionCookie(defaultUser)

  return {
    app,
    persistence,
    cookie,
    defaultUser,
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

export interface RequestOptions {
  cookie?: string | null
}

export async function apiRequest<T>(
  context: TestContext,
  path: string,
  method: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const init: RequestInit = { method }
  const headers: Record<string, string> = {}
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  const cookie = options.cookie === undefined ? context.cookie : options.cookie
  if (cookie) headers.cookie = cookie
  init.headers = headers

  const response = await context.app.request(path, init)
  const text = await response.text()
  return {
    response,
    body: (text ? JSON.parse(text) : null) as T,
  }
}

export async function getJson<T>(
  context: TestContext,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  return apiRequest<T>(context, path, 'GET', undefined, options)
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
