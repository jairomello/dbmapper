import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createTestContext, getJson, sampleDatabase, seedProject, type TestContext } from './helpers'

interface RelationshipExport {
  table: string
  local_columns: string[]
  referenced_columns: string[]
  constraint_name: string
  description: string
  reviewed: boolean
}

interface ColumnExport {
  name: string
  type: string
  primary_key: boolean
  foreign_key: boolean
  description: string
  business_terms: string[]
  reviewed: boolean
  status: string
}

interface TableExport {
  name: string
  description: string
  business_terms: string[]
  reviewed: boolean
  status: string
  relationships: { parents: RelationshipExport[]; children: RelationshipExport[] }
  columns: ColumnExport[]
}

interface DatabaseExport {
  name: string
  description: string
  business_terms: string[]
  reviewed: boolean
  tables: TableExport[]
}

interface ExportBody {
  database: DatabaseExport
}

describe('project-api: export no contrato v1', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('exporta exatamente o conjunto de campos v1 e deriva children', async () => {
    const id = await seedProject(context, sampleDatabase())
    const { response, body } = await getJson<ExportBody>(context, `/api/projects/${id}/export`)

    expect(response.status).toBe(200)
    expect(Object.keys(body)).toEqual(['database'])
    expect('table_ids' in body).toBe(false)
    expect(JSON.stringify(body)).not.toContain('table_ids')
    expect(Object.keys(body.database).sort()).toEqual([
      'business_terms',
      'description',
      'name',
      'reviewed',
      'tables',
    ])
    expect(body.database.name).toBe('Loja')

    const cliente = body.database.tables.find((table) => table.name === 'cliente')!
    const pedido = body.database.tables.find((table) => table.name === 'pedido')!

    expect(Object.keys(cliente).sort()).toEqual([
      'business_terms',
      'columns',
      'description',
      'name',
      'relationships',
      'reviewed',
      'status',
    ])
    expect(Object.keys(cliente.columns[0]).sort()).toEqual([
      'business_terms',
      'description',
      'foreign_key',
      'name',
      'primary_key',
      'reviewed',
      'status',
      'type',
    ])
    expect(Object.keys(pedido.relationships.parents[0]).sort()).toEqual([
      'constraint_name',
      'description',
      'local_columns',
      'referenced_columns',
      'reviewed',
      'table',
    ])

    expect(cliente.relationships.parents).toEqual([])
    expect(cliente.relationships.children).toEqual([
      {
        table: 'pedido',
        local_columns: ['id'],
        referenced_columns: ['cliente_id'],
        constraint_name: 'fk_pedido_cliente',
        description: '',
        reviewed: false,
      },
    ])
    expect(pedido.relationships.parents).toEqual([
      {
        table: 'cliente',
        local_columns: ['cliente_id'],
        referenced_columns: ['id'],
        constraint_name: 'fk_pedido_cliente',
        description: 'Pedido pertence ao cliente',
        reviewed: false,
      },
    ])
    expect(pedido.relationships.children).toEqual([])
    expect(cliente.columns[0]).toEqual({
      name: 'id',
      type: 'serial',
      primary_key: true,
      foreign_key: false,
      description: 'Identificador do cliente',
      business_terms: ['identificador'],
      reviewed: true,
      status: 'UNCHANGED',
    })
  })
})
