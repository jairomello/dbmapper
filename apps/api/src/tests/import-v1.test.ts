import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { apiRequest, createTestContext, getJson, type TestContext } from './helpers'

interface ErrorBody {
  error: { code: string }
}

interface ProjectSummary {
  id: string
  name: string
}

interface ExportBody {
  database: DatabaseModel
}

const legacyProject = {
  database: {
    name: 'Legado',
    tables: [
      {
        name: 'cliente',
        columns: [{ name: 'id', type: 'int' }],
      },
      {
        name: 'pedido',
        columns: [
          { name: 'id', type: 'int' },
          { name: 'cliente_id', type: 'int' },
        ],
        relationships: {
          parents: [{ table: 'cliente', local_columns: ['cliente_id'], referenced_columns: ['id'] }],
        },
      },
    ],
  },
}

describe('project-api: import de JSON v1', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('importa JSON legado preenchendo campos ausentes com defaults', async () => {
    const imported = await apiRequest<{ id: string; name: string }>(
      context,
      '/api/projects/import',
      'POST',
      legacyProject,
    )
    expect(imported.response.status).toBe(201)
    expect(imported.body.name).toBe('Legado')

    const exported = await getJson<ExportBody>(context, `/api/projects/${imported.body.id}/export`)
    const database = exported.body.database

    expect(database.description).toBe('')
    expect(database.business_terms).toEqual([])
    expect(database.reviewed).toBe(false)

    const cliente = database.tables.find((table) => table.name === 'cliente')!
    expect(cliente.description).toBe('')
    expect(cliente.business_terms).toEqual([])
    expect(cliente.reviewed).toBe(false)
    expect(cliente.status).toBe('UNCHANGED')
    expect(cliente.columns[0]).toEqual({
      name: 'id',
      type: 'int',
      primary_key: false,
      foreign_key: false,
      description: '',
      business_terms: [],
      reviewed: false,
      status: 'UNCHANGED',
    })

    const pedido = database.tables.find((table) => table.name === 'pedido')!
    const clienteId = pedido.columns.find((column) => column.name === 'cliente_id')!
    expect(clienteId.foreign_key).toBe(true)
    expect(pedido.relationships.parents).toEqual([
      {
        table: 'cliente',
        local_columns: ['cliente_id'],
        referenced_columns: ['id'],
        constraint_name: '',
        description: '',
        reviewed: false,
      },
    ])
    expect(cliente.relationships.children).toHaveLength(1)
  })

  test('rejeita atomicamente payload sem database', async () => {
    const before = await getJson<ProjectSummary[]>(context, '/api/projects')

    const rejected = await apiRequest<ErrorBody>(context, '/api/projects/import', 'POST', {
      tables: [],
    })
    expect(rejected.response.status).toBe(400)
    expect(rejected.body.error.code).toBe('VALIDATION_ERROR')

    const after = await getJson<ProjectSummary[]>(context, '/api/projects')
    expect(after.body).toEqual(before.body)
  })

  test('rejeita atomicamente payload com tabela inválida', async () => {
    const rejected = await apiRequest<ErrorBody>(context, '/api/projects/import', 'POST', {
      database: { name: 'Inválido', tables: [{ columns: [] }] },
    })
    expect(rejected.response.status).toBe(400)
    expect(rejected.body.error.code).toBe('VALIDATION_ERROR')

    const list = await getJson<ProjectSummary[]>(context, '/api/projects')
    expect(list.body).toEqual([])
  })
})
