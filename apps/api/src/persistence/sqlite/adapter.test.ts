import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, describe, expect, test } from 'bun:test'
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
})
