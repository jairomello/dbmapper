import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, describe, expect, test } from 'bun:test'
import type { Persistence, UserRecord } from '../ports'
import { createSqlitePersistence } from './adapter'

const directories: string[] = []

afterEach(async () => {
  const directory = directories.pop()
  if (directory) await rm(directory, { recursive: true, force: true })
})

function model(): DatabaseModel {
  return {
    name: 'Loja',
    description: '',
    business_terms: [],
    reviewed: false,
    tables: [
      {
        name: 'pedido',
        description: '',
        business_terms: ['venda'],
        reviewed: true,
        status: 'UNCHANGED',
        relationships: { parents: [], children: [] },
        columns: [
          {
            name: 'id',
            type: 'int',
            primary_key: true,
            foreign_key: false,
            description: '',
            business_terms: [],
            reviewed: true,
            status: 'UNCHANGED',
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
  tableId: string
  columnId: string
}

async function fixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), 'dbmapper-agent-repo-'))
  directories.push(directory)
  const persistence = createSqlitePersistence(join(directory, 'test.db'), { migrate: true })
  const user = persistence.users.create({ email: 'member@example.com', passwordHash: 'x', role: 'MEMBER' })
  const project = persistence.projects.create({ name: 'Loja' })
  const aggregate = persistence.projects.replaceModel(project.id, model())!
  const table = aggregate.tables[0]
  const column = aggregate.columns[0]

  return { persistence, user, projectId: project.id, tableId: table.id, columnId: column.id }
}

describe('repositório do agente (SQLite)', () => {
  test('jobs: cria, lista, reivindica com lease e incrementa tentativas no reclaim', async () => {
    const { persistence, user, projectId } = await fixture()

    try {
      const created = persistence.agent.jobs.create(
        {
          id: 'job-1',
          projectId,
          scope: 'project',
          requestedBy: user.id,
          stats: { targets: 2 },
        },
        {
          now: '2026-01-01T00:00:00.000Z',
          audit: {
            projectId,
            actorUserId: user.id,
            action: 'agent.generate_requested',
            subjectType: 'agent_job',
            subjectId: 'job-1',
            payload: { scope: 'project', targets: 2 },
          },
        },
      )

      expect(created.status).toBe('queued')
      expect(created.attempts).toBe(0)
      expect(created.stats).toEqual({ targets: 2 })
      expect(persistence.agent.jobs.get('job-1')).toEqual(created)
      expect(persistence.agent.jobs.listByProject(projectId)).toHaveLength(1)

      const events = persistence.agent.events.list(projectId)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        action: 'agent.generate_requested',
        actorUserId: user.id,
        subjectId: 'job-1',
        payload: { scope: 'project', targets: 2 },
      })

      const claimed = persistence.agent.jobs.claimNext('2026-01-01T00:01:00.000Z', '2026-01-01T00:02:00.000Z')!
      expect(claimed.status).toBe('running')
      expect(claimed.attempts).toBe(1)
      expect(claimed.leaseExpiresAt).toBe('2026-01-01T00:02:00.000Z')

      expect(persistence.agent.jobs.claimNext('2026-01-01T00:01:30.000Z', '2026-01-01T00:02:30.000Z')).toBeNull()

      const reclaimed = persistence.agent.jobs.claimNext('2026-01-01T00:03:00.000Z', '2026-01-01T00:04:00.000Z')!
      expect(reclaimed.status).toBe('running')
      expect(reclaimed.attempts).toBe(2)

      persistence.agent.jobs.heartbeat('job-1', '2026-01-01T00:05:00.000Z', '2026-01-01T00:03:30.000Z')
      expect(persistence.agent.jobs.get('job-1')!.leaseExpiresAt).toBe('2026-01-01T00:05:00.000Z')

      const succeeded = persistence.agent.jobs.succeed('job-1', { created: 1 }, '2026-01-01T00:04:00.000Z')!
      expect(succeeded.status).toBe('succeeded')
      expect(succeeded.stats).toEqual({ created: 1 })
      expect(succeeded.leaseExpiresAt).toBeNull()
      expect(succeeded.error).toBeNull()
    } finally {
      persistence.close()
    }
  })

  test('suggestions: substitui pendentes, edita e aplica com CAS atualizando o item', async () => {
    const { persistence, user, projectId, tableId, columnId } = await fixture()

    try {
      persistence.agent.jobs.create({ id: 'job-1', projectId, scope: 'project', requestedBy: user.id })

      const first = persistence.agent.suggestions.replacePending(
        [
          {
            projectId,
            jobId: 'job-1',
            itemType: 'table',
            itemId: tableId,
            tableId,
            suggestedDescription: 'Pedidos.',
            context: { table: 'pedido' },
            requestedBy: user.id,
          },
          {
            projectId,
            jobId: 'job-1',
            itemType: 'column',
            itemId: columnId,
            tableId,
            suggestedDescription: 'Identificador.',
            context: { column: 'id' },
            requestedBy: user.id,
          },
        ],
        '2026-01-01T00:00:00.000Z',
      )

      expect(first).toHaveLength(2)
      expect(persistence.agent.suggestions.list(projectId)).toHaveLength(2)

      const replaced = persistence.agent.suggestions.replacePending(
        [
          {
            projectId,
            jobId: 'job-1',
            itemType: 'table',
            itemId: tableId,
            tableId,
            suggestedDescription: 'Pedidos de venda.',
            requestedBy: user.id,
          },
        ],
        '2026-01-01T00:01:00.000Z',
      )

      const pending = persistence.agent.suggestions.list(projectId)
      expect(pending).toHaveLength(2)
      expect(pending.map((suggestion) => suggestion.id)).not.toContain(first[0].id)
      expect(pending.find((suggestion) => suggestion.itemType === 'table')!.id).toBe(replaced[0].id)

      const edited = persistence.agent.suggestions.editPending(
        projectId,
        replaced[0].id,
        'Pedidos de venda confirmados.',
        user.id,
        '2026-01-01T00:02:00.000Z',
        {
          projectId,
          action: 'agent.suggestions_edited',
          subjectType: 'ai_suggestion',
          subjectId: replaced[0].id,
        },
      )!
      expect(edited.status).toBe('pending')
      expect(edited.suggestedDescription).toBe('Pedidos de venda confirmados.')

      const applied = persistence.agent.suggestions.apply(
        projectId,
        [replaced[0].id],
        user.id,
        '2026-01-01T00:03:00.000Z',
        {
          projectId,
          action: 'agent.suggestions_applied',
          subjectType: 'project',
          subjectId: projectId,
        },
      )

      expect(applied.decided).toHaveLength(1)
      expect(applied.skipped).toEqual([])

      const aggregate = persistence.projects.get(projectId)!
      expect(aggregate.tables[0].description).toBe('Pedidos de venda confirmados.')
      expect(aggregate.tables[0].descriptionSource).toBe('agent')
      expect(aggregate.tables[0].reviewed).toBe(false)

      const stale = persistence.agent.suggestions.apply(
        projectId,
        [replaced[0].id],
        user.id,
        '2026-01-01T00:04:00.000Z',
        {
          projectId,
          action: 'agent.suggestions_applied',
          subjectType: 'project',
          subjectId: projectId,
        },
      )
      expect(stale.decided).toHaveLength(0)
      expect(stale.skipped).toEqual([replaced[0].id])

      const columnSuggestion = persistence.agent.suggestions
        .list(projectId)
        .find((suggestion) => suggestion.itemType === 'column')!
      const rejected = persistence.agent.suggestions.reject(
        projectId,
        [columnSuggestion.id],
        user.id,
        '2026-01-01T00:05:00.000Z',
        {
          projectId,
          action: 'agent.suggestions_rejected',
          subjectType: 'project',
          subjectId: projectId,
        },
      )
      expect(rejected.decided).toHaveLength(1)
      expect(persistence.agent.suggestions.get(columnSuggestion.id)!.status).toBe('rejected')
      expect(persistence.projects.get(projectId)!.columns[0].description).toBe('')

      const actions = persistence.agent.events.list(projectId).map((event) => event.action)
      expect(actions).toContain('agent.suggestions_edited')
      expect(actions).toContain('agent.suggestions_applied')
      expect(actions).toContain('agent.suggestions_rejected')

      expect(Object.keys(persistence.agent.events).sort()).toEqual(['insert', 'list'])
    } finally {
      persistence.close()
    }
  })
})
