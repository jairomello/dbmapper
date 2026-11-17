import { describe, expect, test } from 'bun:test'
import type { ColumnRecord, ProjectAggregate, RelationshipRecord, TableRecord } from '../persistence/ports'
import { buildAgentContext } from './context'

const now = '2026-01-01T00:00:00.000Z'

function table(id: string, name: string, description: string, position: number): TableRecord {
  return {
    id,
    projectId: 'project-1',
    name,
    description,
    businessTerms: [],
    status: 'UNCHANGED',
    reviewed: false,
    descriptionSource: 'human',
    reviewedBy: null,
    reviewedAt: null,
    position,
    createdAt: now,
    updatedAt: now,
  }
}

function column(
  id: string,
  tableId: string,
  name: string,
  options: { description: string; primaryKey?: boolean; foreignKey?: boolean; type?: string },
): ColumnRecord {
  return {
    id,
    tableId,
    name,
    type: options.type ?? 'text',
    primaryKey: options.primaryKey ?? false,
    foreignKey: options.foreignKey ?? false,
    description: options.description,
    businessTerms: [],
    status: 'UNCHANGED',
    reviewed: false,
    descriptionSource: 'human',
    reviewedBy: null,
    reviewedAt: null,
    position: 0,
    createdAt: now,
    updatedAt: now,
  }
}

function relationship(id: string, tableId: string, targetTable: string, localColumns: string[]): RelationshipRecord {
  return {
    id,
    tableId,
    targetTable,
    localColumns,
    referencedColumns: ['id'],
    constraintName: `fk_${id}`,
    description: '',
    reviewed: false,
    descriptionSource: 'human',
    reviewedBy: null,
    reviewedAt: null,
    position: 0,
    createdAt: now,
    updatedAt: now,
  }
}

function aggregate(): ProjectAggregate {
  const cliente = table('table-cliente', 'cliente', '', 0)
  const pedido = table('table-pedido', 'pedido', 'Pedidos de venda', 1)

  return {
    project: {
      id: 'project-1',
      name: 'Loja',
      description: '',
      businessTerms: [],
      reviewed: false,
      descriptionSource: 'human',
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    tables: [cliente, pedido],
    columns: [
      column('col-cliente-id', cliente.id, 'id', { description: 'Identificador do cliente', primaryKey: true, type: 'int' }),
      column('col-cliente-nome', cliente.id, 'nome', { description: '' }),
      column('col-pedido-id', pedido.id, 'id', { description: '', primaryKey: true, type: 'int' }),
      column('col-pedido-cliente', pedido.id, 'cliente_id', { description: '', foreignKey: true, type: 'int' }),
    ],
    relationships: [relationship('rel-pedido-cliente', pedido.id, 'cliente', ['cliente_id'])],
  }
}

describe('contexto do agente', () => {
  test('escopo de projeto mira apenas itens sem descrição', () => {
    const context = buildAgentContext(aggregate(), 'project')
    expect(context).not.toBeNull()

    const targets = context!.targets.map((target) => `${target.itemType}:${target.tableName}.${target.name}`)
    expect(targets).toEqual(['table:cliente.cliente', 'column:cliente.nome', 'column:pedido.id', 'column:pedido.cliente_id'])
    expect(context!.tables).toHaveLength(2)

    const cliente = context!.tables.find((group) => group.table.name === 'cliente')!
    expect(cliente.describedColumns).toEqual([
      { name: 'id', type: 'int', description: 'Identificador do cliente' },
    ])

    const pedido = context!.tables.find((group) => group.table.name === 'pedido')!
    expect(pedido.foreignKeys).toEqual([{ column: 'cliente_id', targetTable: 'cliente' }])
    expect(pedido.describedColumns).toEqual([])

    const idColumn = pedido.targets.find((target) => target.name === 'id')!
    expect(idColumn.column).toEqual({ type: 'int', primaryKey: true, foreignKey: false })
  })

  test('escopo de tabela limita os alvos à tabela informada', () => {
    const context = buildAgentContext(aggregate(), 'table', 'table-cliente')
    expect(context).not.toBeNull()
    expect(context!.tables).toHaveLength(1)
    expect(context!.targets.map((target) => target.name)).toEqual(['cliente', 'nome'])
  })

  test('tabela inexistente produz contexto nulo', () => {
    expect(buildAgentContext(aggregate(), 'table', 'missing')).toBeNull()
  })

  test('quando tudo está descrito não há alvos nem grupos', () => {
    const model = aggregate()
    model.tables[0].description = 'Clientes'
    model.columns[1].description = 'Nome do cliente'
    model.columns[2].description = 'Identificador do pedido'
    model.columns[3].description = 'Cliente do pedido'

    const context = buildAgentContext(model, 'project')
    expect(context).toEqual({ targets: [], tables: [] })
  })
})
