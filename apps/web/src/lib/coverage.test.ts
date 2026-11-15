import type { ColumnModel, DatabaseModel, RelationshipModel, TableModel } from '@dbmapper/domain'
import { normalizeRelationships } from '@dbmapper/sql-parser'
import { describe, expect, test } from 'bun:test'
import { computeStats } from './coverage'

function makeColumn(name: string, overrides: Partial<ColumnModel> = {}): ColumnModel {
  return {
    name,
    type: 'int',
    primary_key: false,
    foreign_key: false,
    description: '',
    business_terms: [],
    reviewed: false,
    status: 'UNCHANGED',
    ...overrides,
  }
}

function makeTable(name: string, overrides: Partial<TableModel> = {}): TableModel {
  return {
    name,
    description: '',
    business_terms: [],
    reviewed: false,
    status: 'UNCHANGED',
    columns: [],
    relationships: { parents: [], children: [] },
    ...overrides,
  }
}

function makeParent(
  table: string,
  localColumns: string[],
  referencedColumns: string[],
  overrides: Partial<RelationshipModel> = {},
): RelationshipModel {
  return {
    table,
    local_columns: localColumns,
    referenced_columns: referencedColumns,
    constraint_name: '',
    description: '',
    reviewed: false,
    ...overrides,
  }
}

function makeDb(tables: TableModel[]): DatabaseModel {
  return { name: 'Teste', description: '', business_terms: [], reviewed: false, tables }
}

describe('coverage-stats: port do contrato v1', () => {
  test('sem FKs conta zero', () => {
    const stats = computeStats(makeDb([makeTable('a', { columns: [makeColumn('id')] })]))
    expect(stats.totalFks).toBe(0)
    expect(stats.fksDesc).toBe(0)
    expect(stats.fksRev).toBe(0)
  })

  test('FKs sem descrição contam como pendentes', () => {
    const db = makeDb([
      makeTable('pedido', {
        columns: [makeColumn('id'), makeColumn('cliente_id')],
        relationships: { parents: [makeParent('cliente', ['cliente_id'], ['id'])], children: [] },
      }),
      makeTable('cliente', { columns: [makeColumn('id')] }),
    ])
    normalizeRelationships(db.tables)
    const stats = computeStats(db)
    expect(stats.totalFks).toBe(1)
    expect(stats.fksDesc).toBe(0)
    expect(stats.fksRev).toBe(0)
  })

  test('mistura de FKs descreve e revisa corretamente', () => {
    const db = makeDb([
      makeTable('pedido', {
        columns: [makeColumn('id'), makeColumn('a_id'), makeColumn('b_id'), makeColumn('c_id')],
        relationships: {
          parents: [
            makeParent('a', ['a_id'], ['id'], { description: 'lookup to A' }),
            makeParent('b', ['b_id'], ['id'], { description: 'lookup to B', reviewed: true }),
            makeParent('c', ['c_id'], ['id']),
          ],
          children: [],
        },
      }),
      makeTable('a', { columns: [makeColumn('id')] }),
      makeTable('b', { columns: [makeColumn('id')] }),
      makeTable('c', { columns: [makeColumn('id')] }),
    ])
    normalizeRelationships(db.tables)
    const stats = computeStats(db)
    expect(stats.totalFks).toBe(3)
    expect(stats.fksDesc).toBe(2)
    expect(stats.fksRev).toBe(1)
  })

  test('FKs de tabela REMOVED não entram no total', () => {
    const db = makeDb([
      makeTable('alive', {
        columns: [makeColumn('id')],
        relationships: { parents: [makeParent('ghost', ['id'], ['id'])], children: [] },
      }),
      makeTable('ghost', {
        status: 'REMOVED',
        columns: [makeColumn('id')],
      }),
    ])
    normalizeRelationships(db.tables)
    const stats = computeStats(db)
    expect(stats.totalFks).toBe(1)
  })

  test('descrição só com espaços não conta como descrita', () => {
    const db = makeDb([
      makeTable('a', {
        columns: [makeColumn('id')],
        relationships: { parents: [makeParent('b', ['id'], ['id'], { description: '   ' })], children: [] },
      }),
      makeTable('b', { columns: [makeColumn('id')] }),
    ])
    normalizeRelationships(db.tables)
    const stats = computeStats(db)
    expect(stats.totalFks).toBe(1)
    expect(stats.fksDesc).toBe(0)
    expect(stats.fksRev).toBe(0)
  })

  test('normalizeRelationships preenche description/reviewed ausentes', () => {
    const tables: TableModel[] = [
      makeTable('a', {
        columns: [makeColumn('id')],
        relationships: {
          parents: [{ table: 'b', local_columns: ['id'], referenced_columns: ['id'], constraint_name: '' } as RelationshipModel],
          children: [],
        },
      }),
    ]
    normalizeRelationships(tables)
    expect(tables[0].relationships.parents[0].description).toBe('')
    expect(tables[0].relationships.parents[0].reviewed).toBe(false)
  })

  test('totais, percentuais e pendentes refletem o modelo', () => {
    const tables = [
      makeTable('a', {
        description: 'Tabela A',
        reviewed: true,
        columns: [
          makeColumn('id', { description: 'id', reviewed: true }),
          makeColumn('nome', { description: 'nome' }),
          makeColumn('x'),
        ],
      }),
      makeTable('b', {
        columns: [makeColumn('id', { description: 'id', reviewed: true }), makeColumn('y')],
      }),
      makeTable('c', { columns: [makeColumn('id'), makeColumn('z')] }),
    ]

    const stats = computeStats(makeDb(tables))
    expect(stats.totalTables).toBe(3)
    expect(stats.totalCols).toBe(7)
    expect(stats.descTables).toBe(1)
    expect(stats.descCols).toBe(3)
    expect(stats.revTables).toBe(1)
    expect(stats.revCols).toBe(2)
    expect(stats.pendingTotal).toBe(2 + 5)
    expect(stats.pct).toBe(30)
  })
})
