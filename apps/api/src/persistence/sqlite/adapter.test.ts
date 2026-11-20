import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, describe, expect, test } from 'bun:test'
import { DiagramDocumentValidationError, type PutDiagramDocumentInput } from '../ports'
import { createSqlitePersistence } from './adapter'

const directories: string[] = []

async function createPersistence() {
  const directory = await mkdtemp(join(tmpdir(), 'dbmapper-adapter-'))
  directories.push(directory)
  return createSqlitePersistence(join(directory, 'test.db'), { migrate: true })
}

afterEach(async () => {
  const directory = directories.pop()
  if (directory) await rm(directory, { recursive: true, force: true })
})

const database: DatabaseModel = {
  name: 'Loja',
  description: 'Banco da loja',
  business_terms: ['venda'],
  reviewed: true,
  tables: [
    {
      name: 'cliente',
      description: 'Clientes',
      business_terms: ['pessoa'],
      reviewed: true,
      status: 'UNCHANGED',
      relationships: { parents: [], children: [] },
      columns: [
        {
          name: 'id',
          type: 'int',
          primary_key: true,
          foreign_key: false,
          description: 'Identificador',
          business_terms: ['id'],
          reviewed: true,
          status: 'UNCHANGED',
        },
      ],
    },
    {
      name: 'pedido',
      description: 'Pedidos',
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
          type: 'int',
          primary_key: true,
          foreign_key: false,
          description: '',
          business_terms: [],
          reviewed: false,
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

describe('persistência SQLite', () => {
  test('persiste e recarrega um projeto completo com metadados e relacionamentos', async () => {
    const persistence = await createPersistence()

    try {
      const created = persistence.projects.create({ name: 'Projeto inicial', description: 'descrição' })
      expect(created.id).toBeTruthy()

      const saved = persistence.projects.replaceModel(created.id, database)
      expect(saved).not.toBeNull()
      expect(saved!.project.name).toBe('Loja')
      expect(saved!.project.businessTerms).toEqual(['venda'])
      expect(saved!.tables.map((table) => table.name)).toEqual(['cliente', 'pedido'])
      expect(saved!.columns.filter((column) => column.tableId === saved!.tables[1].id)).toHaveLength(2)

      const pedido = saved!.tables.find((table) => table.name === 'pedido')!
      const relationship = saved!.relationships.find((item) => item.tableId === pedido.id)!
      expect(relationship.targetTable).toBe('cliente')
      expect(relationship.localColumns).toEqual(['cliente_id'])
      expect(relationship.constraintName).toBe('fk_pedido_cliente')

      const reloaded = persistence.projects.get(created.id)
      expect(reloaded).not.toBeNull()
      expect(reloaded!.tables.map((table) => table.name)).toEqual(['cliente', 'pedido'])
      expect(
        reloaded!.columns.find((column) => column.name === 'cliente_id')!.description,
      ).toBe('Cliente do pedido')

      const applied = persistence.projects.applyModel(created.id, database, {
        sqlHash: 'hash-1',
        planSnapshot: JSON.stringify({ tables: { kept: ['cliente', 'pedido'] } }),
      })
      expect(applied).not.toBeNull()
      expect(applied!.run.sqlHash).toBe('hash-1')
      expect(persistence.projects.listImportRuns(created.id)).toHaveLength(1)
    } finally {
      persistence.close()
    }
  })

  test('retorna null ao gravar um projeto inexistente', async () => {
    const persistence = await createPersistence()

    try {
      expect(persistence.projects.replaceModel('missing', database)).toBeNull()
      expect(persistence.projects.applyModel('missing', database, { sqlHash: 'x', planSnapshot: '{}' })).toBeNull()
    } finally {
      persistence.close()
    }
  })

  test('persiste o layout do diagrama por nome com roundtrip e upsert idempotente', async () => {
    const persistence = await createPersistence()

    try {
      const created = persistence.projects.create({ name: 'Layout' })
      persistence.projects.replaceModel(created.id, database)

      const saved = persistence.projects.putDiagramLayout({
        projectId: created.id,
        positions: { cliente: { x: 10, y: 20 }, pedido: { x: 300.5, y: 40 } },
        viewportX: -5,
        viewportY: 12,
        zoom: 0.8,
      })
      expect(saved).not.toBeNull()

      const loaded = persistence.projects.getDiagramLayout(created.id)
      expect(loaded).not.toBeNull()
      expect(loaded!.zoneName).toBe('Principal')
      expect(loaded!.positions).toEqual({ cliente: { x: 10, y: 20 }, pedido: { x: 300.5, y: 40 } })
      expect(loaded!.viewportX).toBe(-5)
      expect(loaded!.viewportY).toBe(12)
      expect(loaded!.zoom).toBe(0.8)

      persistence.projects.putDiagramLayout({
        projectId: created.id,
        positions: { cliente: { x: 99, y: 100 } },
        viewportX: 1,
        viewportY: 2,
        zoom: 1.5,
      })

      const reloaded = persistence.projects.getDiagramLayout(created.id)
      expect(reloaded!.positions).toEqual({ cliente: { x: 99, y: 100 } })
      expect(reloaded!.zoom).toBe(1.5)
      expect(reloaded!.viewportX).toBe(1)
      expect(reloaded!.viewportY).toBe(2)
    } finally {
      persistence.close()
    }
  })

  test('descarta posições de tabelas ausentes do modelo no GET', async () => {
    const persistence = await createPersistence()

    try {
      const created = persistence.projects.create({ name: 'Órfãos' })
      persistence.projects.replaceModel(created.id, database)
      persistence.projects.putDiagramLayout({
        projectId: created.id,
        positions: { cliente: { x: 1, y: 2 }, tabela_removida: { x: 3, y: 4 } },
        viewportX: 0,
        viewportY: 0,
        zoom: 1,
      })

      const loaded = persistence.projects.getDiagramLayout(created.id)
      expect(loaded!.positions).toEqual({ cliente: { x: 1, y: 2 } })
    } finally {
      persistence.close()
    }
  })

  test('GET de projeto sem layout retorna layout vazio e projeto inexistente retorna null', async () => {
    const persistence = await createPersistence()

    try {
      const created = persistence.projects.create({ name: 'Sem layout' })

      const loaded = persistence.projects.getDiagramLayout(created.id)
      expect(loaded).toEqual({
        projectId: created.id,
        zoneName: 'Principal',
        positions: {},
        viewportX: 0,
        viewportY: 0,
        zoom: 1,
        updatedAt: null,
        updatedBy: null,
      })

      expect(persistence.projects.getDiagramLayout('missing')).toBeNull()
      expect(
        persistence.projects.putDiagramLayout({
          projectId: 'missing',
          positions: {},
          viewportX: 0,
          viewportY: 0,
          zoom: 1,
        }),
      ).toBeNull()
    } finally {
      persistence.close()
    }
  })

  test('grava diagram.layout_saved com ator e projeto na mesma transação', async () => {
    const persistence = await createPersistence()

    try {
      const created = persistence.projects.create({ name: 'Auditado' })
      persistence.projects.replaceModel(created.id, database)
      const actor = persistence.users.create({
        email: 'layout@example.com',
        passwordHash: 'hash',
        role: 'MEMBER',
      })

      persistence.projects.putDiagramLayout({
        projectId: created.id,
        positions: { cliente: { x: 1, y: 2 } },
        viewportX: 0,
        viewportY: 0,
        zoom: 1,
        actorUserId: actor.id,
        audit: {
          actorUserId: actor.id,
          action: 'diagram.layout_saved',
          subjectType: 'project',
          subjectId: created.id,
        },
      })

      const events = persistence.agent.events.listAll().filter((event) => event.action === 'diagram.layout_saved')
      expect(events).toHaveLength(1)
      expect(events[0].actorUserId).toBe(actor.id)
      expect(events[0].projectId).toBe(created.id)
      expect(events[0].subjectId).toBe(created.id)
    } finally {
      persistence.close()
    }
  })

  test('escrita que falha não deixa evento nem layout gravado', async () => {
    const persistence = await createPersistence()

    try {
      const created = persistence.projects.create({ name: 'Falha' })
      persistence.projects.replaceModel(created.id, database)
      const actor = persistence.users.create({
        email: 'falha@example.com',
        passwordHash: 'hash',
        role: 'MEMBER',
      })
      const before = persistence.agent.events.listAll().length

      expect(() =>
        persistence.projects.putDiagramLayout({
          projectId: created.id,
          positions: { cliente: { x: 1, y: 2 } },
          viewportX: 0,
          viewportY: 0,
          zoom: 1,
          actorUserId: actor.id,
          audit: {
            actorUserId: 'usuario-inexistente',
            action: 'diagram.layout_saved',
            subjectType: 'project',
            subjectId: created.id,
          },
        }),
      ).toThrow()

      expect(persistence.agent.events.listAll()).toHaveLength(before)
      expect(persistence.agent.events.listAll().some((event) => event.action === 'diagram.layout_saved')).toBe(false)
      expect(persistence.projects.getDiagramLayout(created.id)!.positions).toEqual({})
    } finally {
      persistence.close()
    }
  })
})

describe('persistência SQLite: documento de diagrama com zonas', () => {
  const documentInput = (projectId: string): PutDiagramDocumentInput => ({
    projectId,
    zones: [
      { name: 'Principal', tabOrder: 0, members: ['cliente'] },
      { name: 'Vendas', tabOrder: 1, members: ['pedido'] },
    ],
    layouts: [
      {
        zoneName: 'Principal',
        positions: { cliente: { x: 10, y: 20 } },
        viewportX: 1,
        viewportY: 2,
        zoom: 0.8,
      },
      {
        zoneName: 'Vendas',
        positions: { pedido: { x: 300.5, y: 40 } },
        viewportX: -5,
        viewportY: 12,
        zoom: 1.5,
      },
    ],
  })

  test('faz roundtrip de zonas e layouts no mesmo documento', async () => {
    const persistence = await createPersistence()

    try {
      const created = persistence.projects.create({ name: 'Zonas' })
      persistence.projects.replaceModel(created.id, database)

      const saved = persistence.projects.putDiagramDocument(documentInput(created.id))
      expect(saved).not.toBeNull()
      expect(saved!.zones).toEqual([
        { name: 'Principal', tabOrder: 0, members: ['cliente'] },
        { name: 'Vendas', tabOrder: 1, members: ['pedido'] },
      ])
      expect(saved!.layouts.map((layout) => layout.zoneName)).toEqual(['Principal', 'Vendas'])

      const loaded = persistence.projects.getDiagramDocument(created.id)
      expect(loaded).not.toBeNull()
      expect(loaded!.zones).toEqual(saved!.zones)
      expect(loaded!.layouts).toHaveLength(2)
      expect(loaded!.layouts.find((layout) => layout.zoneName === 'Vendas')!.positions).toEqual({
        pedido: { x: 300.5, y: 40 },
      })
      expect(loaded!.layouts.find((layout) => layout.zoneName === 'Principal')!.zoom).toBe(0.8)
    } finally {
      persistence.close()
    }
  })

  test('documento legado sem zones é lido como todas as tabelas em Principal', async () => {
    const persistence = await createPersistence()

    try {
      const created = persistence.projects.create({ name: 'Legado' })
      persistence.projects.replaceModel(created.id, database)
      persistence.projects.putDiagramLayout({
        projectId: created.id,
        positions: { cliente: { x: 1, y: 2 } },
        viewportX: 0,
        viewportY: 0,
        zoom: 1,
      })

      const loaded = persistence.projects.getDiagramDocument(created.id)
      expect(loaded!.zones).toEqual([{ name: 'Principal', tabOrder: 0, members: ['cliente', 'pedido'] }])
      expect(loaded!.layouts).toHaveLength(1)
      expect(loaded!.layouts[0].zoneName).toBe('Principal')
      expect(loaded!.layouts[0].positions).toEqual({ cliente: { x: 1, y: 2 } })
      expect(loaded!.layouts[0].updatedBy).toBeNull()
    } finally {
      persistence.close()
    }
  })

  test('rejeita membro inexistente sem gravar nada', async () => {
    const persistence = await createPersistence()

    try {
      const created = persistence.projects.create({ name: 'Membro inválido' })
      persistence.projects.replaceModel(created.id, database)

      expect(() =>
        persistence.projects.putDiagramDocument({
          projectId: created.id,
          zones: [{ name: 'Principal', tabOrder: 0, members: ['tabela_inexistente'] }],
          layouts: [],
        }),
      ).toThrow(DiagramDocumentValidationError)

      const loaded = persistence.projects.getDiagramDocument(created.id)
      expect(loaded!.zones).toEqual([{ name: 'Principal', tabOrder: 0, members: ['cliente', 'pedido'] }])
    } finally {
      persistence.close()
    }
  })

  test('excluir uma zona devolve os membros para Principal', async () => {
    const persistence = await createPersistence()

    try {
      const created = persistence.projects.create({ name: 'Exclusão' })
      persistence.projects.replaceModel(created.id, database)
      persistence.projects.putDiagramDocument(documentInput(created.id))

      const saved = persistence.projects.putDiagramDocument({
        projectId: created.id,
        zones: [{ name: 'Principal', tabOrder: 0, members: ['cliente'] }],
        layouts: [
          {
            zoneName: 'Principal',
            positions: { cliente: { x: 10, y: 20 } },
            viewportX: 0,
            viewportY: 0,
            zoom: 1,
          },
        ],
      })

      expect(saved!.zones).toEqual([{ name: 'Principal', tabOrder: 0, members: ['cliente', 'pedido'] }])
      expect(saved!.layouts.map((layout) => layout.zoneName)).toEqual(['Principal'])
    } finally {
      persistence.close()
    }
  })

  test('falha na escrita desfaz zonas e layouts juntos', async () => {
    const persistence = await createPersistence()

    try {
      const created = persistence.projects.create({ name: 'Atomicidade' })
      persistence.projects.replaceModel(created.id, database)
      persistence.projects.putDiagramDocument(documentInput(created.id))
      const before = persistence.projects.getDiagramDocument(created.id)

      expect(() =>
        persistence.projects.putDiagramDocument({
          projectId: created.id,
          zones: [{ name: 'Principal', tabOrder: 0, members: ['pedido'] }],
          layouts: [
            {
              zoneName: 'Principal',
              positions: { pedido: { x: 99, y: 99 } },
              viewportX: 0,
              viewportY: 0,
              zoom: 2,
            },
          ],
          audit: {
            actorUserId: 'usuario-inexistente',
            action: 'diagram.layout_saved',
            subjectType: 'project',
            subjectId: created.id,
          },
        }),
      ).toThrow()

      const after = persistence.projects.getDiagramDocument(created.id)
      expect(after!.zones).toEqual(before!.zones)
      expect(after!.layouts.map((layout) => layout.positions)).toEqual(
        before!.layouts.map((layout) => layout.positions),
      )
    } finally {
      persistence.close()
    }
  })
})
