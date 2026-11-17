import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, describe, expect, test } from 'bun:test'
import type { Persistence, UserRecord } from '../persistence/ports'
import { createSqlitePersistence } from '../persistence/sqlite/adapter'
import { createFakeProvider, type ModelProvider } from './provider'
import { createAgentWorker } from './worker'

const directories: string[] = []

afterEach(async () => {
  const directory = directories.pop()
  if (directory) await rm(directory, { recursive: true, force: true })
})

function column(name: string, type = 'text') {
  return {
    name,
    type,
    primary_key: name === 'id',
    foreign_key: false,
    description: '',
    business_terms: [],
    reviewed: false,
    status: 'UNCHANGED' as const,
  }
}

function model(options: { described?: boolean } = {}): DatabaseModel {
  const described = options.described ?? false
  return {
    name: 'Loja',
    description: '',
    business_terms: [],
    reviewed: false,
    tables: [
      {
        name: 'pedido',
        description: described ? 'Pedidos de venda' : '',
        business_terms: ['venda'],
        reviewed: false,
        status: 'UNCHANGED',
        relationships: { parents: [], children: [] },
        columns: [column('id', 'int'), column('nome')].map((item) => ({
          ...item,
          description: described ? 'Descrito' : '',
        })),
      },
      {
        name: 'item',
        description: described ? 'Itens do pedido' : '',
        business_terms: [],
        reviewed: false,
        status: 'UNCHANGED',
        relationships: { parents: [], children: [] },
        columns: [
          {
            ...column('quantidade', 'int'),
            description: described ? 'Descrito' : '',
          },
        ],
      },
    ],
  }
}

interface Fixture {
  persistence: Persistence
  user: UserRecord
  projectId: string
}

async function fixture(options: { described?: boolean } = {}): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), 'dbmapper-agent-worker-'))
  directories.push(directory)
  const persistence = createSqlitePersistence(join(directory, 'test.db'), { migrate: true })
  const user = persistence.users.create({ email: 'member@example.com', passwordHash: 'x', role: 'MEMBER' })
  const project = persistence.projects.create({ name: 'Loja' })
  persistence.projects.replaceModel(project.id, model(options))
  return { persistence, user, projectId: project.id }
}

function createJob(fixture: Fixture, id: string) {
  return fixture.persistence.agent.jobs.create({
    id,
    projectId: fixture.projectId,
    scope: 'project',
    requestedBy: fixture.user.id,
    stats: { targets: 0 },
  })
}

describe('worker do agente', () => {
  test('processa um job com sucesso escrevendo uma sugestão pendente por alvo', async () => {
    const { persistence, user, projectId } = await fixture()
    const provider = createFakeProvider()

    try {
      createJob({ persistence, user, projectId }, 'job-1')
      const worker = createAgentWorker({ persistence, provider })

      expect(await worker.processNext()).toBe(true)
      expect(await worker.processNext()).toBe(false)

      const job = persistence.agent.jobs.get('job-1')!
      expect(job.status).toBe('succeeded')
      expect(job.attempts).toBe(1)
      expect(job.error).toBeNull()
      expect(job.stats).toMatchObject({ targets: 5, created: 5, skipped: 0, tables: 2, tablesProcessed: 2 })

      const pending = persistence.agent.suggestions.list(projectId)
      expect(pending).toHaveLength(5)
      expect(pending.every((suggestion) => suggestion.status === 'pending')).toBe(true)
      expect(pending.every((suggestion) => typeof suggestion.context.item === 'object')).toBe(true)
      expect(pending.every((suggestion) => suggestion.jobId === 'job-1')).toBe(true)
    } finally {
      persistence.close()
    }
  })

  test('falha do provider no meio mantém sugestões já escritas e marca o job como failed', async () => {
    const { persistence, user, projectId } = await fixture()
    const fake = createFakeProvider()
    let calls = 0
    const provider: ModelProvider = {
      name: 'falha-controlada',
      async complete(input) {
        calls += 1
        if (calls === 2) throw new Error('falha simulada do provider')
        return fake.complete(input)
      },
    }

    try {
      createJob({ persistence, user, projectId }, 'job-1')
      const worker = createAgentWorker({ persistence, provider })
      await worker.processNext()

      const job = persistence.agent.jobs.get('job-1')!
      expect(job.status).toBe('failed')
      expect(job.error).toBe('falha simulada do provider')
      expect(job.stats).toMatchObject({ created: 3, tablesProcessed: 1 })

      const pending = persistence.agent.suggestions.list(projectId)
      expect(pending).toHaveLength(3)
      expect(pending.every((suggestion) => suggestion.status === 'pending')).toBe(true)
    } finally {
      persistence.close()
    }
  })

  test('lease expirado é reivindicado novamente com tentativa incrementada', async () => {
    const { persistence, user, projectId } = await fixture()

    try {
      createJob({ persistence, user, projectId }, 'job-1')
      const first = persistence.agent.jobs.claimNext(
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:01:00.000Z',
      )!
      expect(first.attempts).toBe(1)

      const worker = createAgentWorker({ persistence, provider: createFakeProvider() })
      expect(await worker.processNext(new Date('2026-01-01T00:02:00.000Z'))).toBe(true)

      const job = persistence.agent.jobs.get('job-1')!
      expect(job.status).toBe('succeeded')
      expect(job.attempts).toBe(2)
    } finally {
      persistence.close()
    }
  })

  test('nova geração substitui a sugestão pendente do mesmo item', async () => {
    const { persistence, user, projectId } = await fixture()
    const worker = createAgentWorker({ persistence, provider: createFakeProvider() })

    try {
      createJob({ persistence, user, projectId }, 'job-1')
      await worker.processNext()
      const firstPending = persistence.agent.suggestions.list(projectId)
      expect(firstPending).toHaveLength(5)

      createJob({ persistence, user, projectId }, 'job-2')
      await worker.processNext()

      const secondPending = persistence.agent.suggestions.list(projectId)
      expect(secondPending).toHaveLength(5)
      expect(secondPending.every((suggestion) => suggestion.jobId === 'job-2')).toBe(true)
      expect(secondPending.map((suggestion) => suggestion.id)).not.toEqual(
        firstPending.map((suggestion) => suggestion.id),
      )
    } finally {
      persistence.close()
    }
  })

  test('job sem alvos termina com sucesso e zero sugestões', async () => {
    const { persistence, user, projectId } = await fixture({ described: true })
    const worker = createAgentWorker({ persistence, provider: createFakeProvider() })

    try {
      createJob({ persistence, user, projectId }, 'job-1')
      await worker.processNext()

      const job = persistence.agent.jobs.get('job-1')!
      expect(job.status).toBe('succeeded')
      expect(job.stats).toMatchObject({ targets: 0, created: 0, tables: 0, tablesProcessed: 0 })
      expect(persistence.agent.suggestions.list(projectId)).toHaveLength(0)
    } finally {
      persistence.close()
    }
  })
})
