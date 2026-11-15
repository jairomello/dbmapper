import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { sha256, type ImportPlan } from '../services/model-import'
import {
  apiRequest,
  createTestContext,
  getJson,
  sampleDatabase,
  seedProject,
  type TestContext,
} from './helpers'

interface ErrorBody {
  error: { code: string; message: string; retryable: boolean }
}

interface ApplyResponse {
  project: { id: string; database: DatabaseModel }
  plan: ImportPlan
  run: { id: string; sqlHash: string; planSnapshot: string; createdAt: string }
}

const metadataDatabase: DatabaseModel = {
  name: 'Metadados',
  description: '',
  business_terms: [],
  reviewed: false,
  tables: [
    {
      name: 'cidades',
      description: 'Cadastro de cidades',
      business_terms: ['cidade'],
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
        {
          name: 'nome',
          type: 'text',
          primary_key: false,
          foreign_key: false,
          description: 'Nome da cidade',
          business_terms: ['nome'],
          reviewed: true,
          status: 'UNCHANGED',
        },
      ],
    },
    {
      name: 'pedido',
      description: 'Pedidos de venda',
      business_terms: ['pedido'],
      reviewed: false,
      status: 'UNCHANGED',
      relationships: {
        parents: [
          {
            table: 'status_pedido',
            local_columns: ['status_pedido_id'],
            referenced_columns: ['id'],
            constraint_name: 'fk_old',
            description: 'Relacionamento antigo',
            reviewed: true,
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
          description: 'Identificador',
          business_terms: ['id'],
          reviewed: true,
          status: 'UNCHANGED',
        },
        {
          name: 'status_pedido_id',
          type: 'int',
          primary_key: false,
          foreign_key: true,
          description: 'Status do pedido',
          business_terms: ['status'],
          reviewed: true,
          status: 'UNCHANGED',
        },
        {
          name: 'valor_total',
          type: 'double',
          primary_key: false,
          foreign_key: false,
          description: 'Valor total',
          business_terms: ['total'],
          reviewed: true,
          status: 'UNCHANGED',
        },
        {
          name: 'legacy',
          type: 'text',
          primary_key: false,
          foreign_key: false,
          description: 'Coluna removida',
          business_terms: [],
          reviewed: true,
          status: 'UNCHANGED',
        },
      ],
    },
    {
      name: 'status_pedido',
      description: 'Removida no banco novo',
      business_terms: [],
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
          business_terms: [],
          reviewed: true,
          status: 'UNCHANGED',
        },
      ],
    },
  ],
}

const metadataSql = `
CREATE TABLE cidade (id int, nome text, estado_id int);
CREATE TABLE pedido (id int, status_id int, total decimal(10,2), criado_em timestamp, cliente_id int REFERENCES cliente (id));
CREATE TABLE cliente (id int);
CREATE TABLE tipo_consulta (id int, nome text);
`

const metadataRenames = {
  tables: [{ from: 'cidades', to: 'cidade' }],
  columns: [
    { table: 'pedido', from: 'status_pedido_id', to: 'status_id' },
    { table: 'pedido', from: 'valor_total', to: 'total' },
  ],
}

describe('model-import: apply', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('preserva metadados de kept/renamed, cria NEW, marca CHANGED, remove itens e aplica FKs do SQL novo', async () => {
    const id = await seedProject(context, metadataDatabase)

    const preview = await apiRequest<{ plan: ImportPlan }>(
      context,
      `/api/projects/${id}/imports/preview`,
      'POST',
      { sql: metadataSql, renames: metadataRenames },
    )
    expect(preview.response.status).toBe(200)

    const applied = await apiRequest<ApplyResponse>(
      context,
      `/api/projects/${id}/imports/apply`,
      'POST',
      { sql: metadataSql, renames: metadataRenames, plan: preview.body.plan },
    )

    expect(applied.response.status).toBe(200)
    const database = applied.body.project.database
    expect(database.tables.map((table) => table.name)).toEqual(['cidade', 'pedido', 'cliente', 'tipo_consulta'])

    const cidade = database.tables.find((table) => table.name === 'cidade')!
    expect(cidade.description).toBe('Cadastro de cidades')
    expect(cidade.business_terms).toEqual(['cidade'])
    expect(cidade.reviewed).toBe(true)
    expect(cidade.status).toBe('RENAMED')
    expect(cidade.columns.map((column) => column.name)).toEqual(['id', 'nome', 'estado_id'])
    expect(cidade.columns.find((column) => column.name === 'nome')!.description).toBe('Nome da cidade')
    expect(cidade.columns.find((column) => column.name === 'estado_id')).toMatchObject({
      description: '',
      business_terms: [],
      reviewed: false,
      status: 'NEW',
    })

    const pedido = database.tables.find((table) => table.name === 'pedido')!
    expect(pedido.description).toBe('Pedidos de venda')
    expect(pedido.business_terms).toEqual(['pedido'])
    expect(pedido.reviewed).toBe(false)
    expect(pedido.status).toBe('UNCHANGED')
    expect(pedido.columns.map((column) => column.name)).toEqual([
      'id',
      'status_id',
      'total',
      'criado_em',
      'cliente_id',
    ])
    expect(pedido.columns.find((column) => column.name === 'id')).toMatchObject({
      type: 'int',
      status: 'CHANGED',
    })
    expect(pedido.columns.find((column) => column.name === 'status_id')).toMatchObject({
      description: 'Status do pedido',
      status: 'UNCHANGED',
    })
    expect(pedido.columns.find((column) => column.name === 'total')).toMatchObject({
      description: 'Valor total',
      status: 'CHANGED',
    })
    expect(pedido.columns.find((column) => column.name === 'criado_em')).toMatchObject({
      status: 'NEW',
      reviewed: false,
    })
    expect(pedido.columns.find((column) => column.name === 'cliente_id')).toMatchObject({
      foreign_key: true,
      status: 'NEW',
    })
    expect(pedido.columns.find((column) => column.name === 'legacy')).toBeUndefined()

    const cliente = database.tables.find((table) => table.name === 'cliente')!
    expect(cliente).toMatchObject({ description: '', reviewed: false, status: 'NEW' })
    expect(cliente.columns[0].status).toBe('NEW')

    const tipoConsulta = database.tables.find((table) => table.name === 'tipo_consulta')!
    expect(tipoConsulta.status).toBe('NEW')
    expect(tipoConsulta.columns.map((column) => column.status)).toEqual(['NEW', 'NEW'])

    expect(database.tables.find((table) => table.name === 'status_pedido')).toBeUndefined()

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
    expect(cliente.relationships.children).toEqual([
      {
        table: 'pedido',
        local_columns: ['id'],
        referenced_columns: ['cliente_id'],
        constraint_name: '',
        description: '',
        reviewed: false,
      },
    ])

    expect(applied.body.run.sqlHash).toBe(sha256(metadataSql))
    expect(JSON.parse(applied.body.run.planSnapshot).planHash).toBe(applied.body.plan.planHash)

    const runs = await getJson<{ runs: Array<{ sqlHash: string; plan: ImportPlan }> }>(
      context,
      `/api/projects/${id}/imports`,
    )
    expect(runs.body.runs).toHaveLength(1)
    expect(runs.body.runs[0].sqlHash).toBe(sha256(metadataSql))
    expect(runs.body.runs[0].plan.planHash).toBe(applied.body.plan.planHash)

    const exported = await getJson<{ database: DatabaseModel }>(context, `/api/projects/${id}/export`)
    expect(exported.body.database.tables.map((table) => table.name)).toEqual(database.tables.map((table) => table.name))
  })

  test('plano desatualizado é rejeitado sem gravar modelo nem histórico', async () => {
    const id = await seedProject(context, sampleDatabase())
    const sql = 'CREATE TABLE produto (id int, nome text);'

    const preview = await apiRequest<{ plan: ImportPlan }>(
      context,
      `/api/projects/${id}/imports/preview`,
      'POST',
      { sql },
    )
    expect(preview.response.status).toBe(200)

    const current = await getJson<{ database: DatabaseModel }>(context, `/api/projects/${id}/export`)
    const changed = current.body.database
    changed.description = 'Alterado depois do preview'
    await apiRequest(context, `/api/projects/${id}`, 'PUT', { database: changed })

    const beforeApply = await getJson<{ database: DatabaseModel }>(context, `/api/projects/${id}/export`)

    const applied = await apiRequest<ErrorBody>(context, `/api/projects/${id}/imports/apply`, 'POST', {
      sql,
      plan: preview.body.plan,
    })

    expect(applied.response.status).toBe(409)
    expect(applied.body.error.code).toBe('STALE_PLAN')
    expect(applied.body.error.retryable).toBe(true)

    const afterApply = await getJson<{ database: DatabaseModel }>(context, `/api/projects/${id}/export`)
    expect(afterApply.body).toEqual(beforeApply.body)

    const runs = await getJson<{ runs: unknown[] }>(context, `/api/projects/${id}/imports`)
    expect(runs.body.runs).toEqual([])
  })

  test('plano adulterado é rejeitado', async () => {
    const id = await seedProject(context, sampleDatabase())
    const sql = 'CREATE TABLE produto (id int);'

    const preview = await apiRequest<{ plan: ImportPlan }>(
      context,
      `/api/projects/${id}/imports/preview`,
      'POST',
      { sql },
    )

    const tampered = {
      ...preview.body.plan,
      planHash: preview.body.plan.planHash.replace(/.$/, preview.body.plan.planHash.endsWith('0') ? '1' : '0'),
    }

    const applied = await apiRequest<ErrorBody>(context, `/api/projects/${id}/imports/apply`, 'POST', {
      sql,
      plan: tampered,
    })

    expect(applied.response.status).toBe(409)
    expect(applied.body.error.code).toBe('STALE_PLAN')

    const runs = await getJson<{ runs: unknown[] }>(context, `/api/projects/${id}/imports`)
    expect(runs.body.runs).toEqual([])
  })

  test('apply com SQL inválido não grava nada', async () => {
    const id = await seedProject(context, sampleDatabase())
    const sql = 'CREATE TABLE produto (id int);'
    const preview = await apiRequest<{ plan: ImportPlan }>(
      context,
      `/api/projects/${id}/imports/preview`,
      'POST',
      { sql },
    )

    const before = await getJson<{ database: DatabaseModel }>(context, `/api/projects/${id}/export`)
    const applied = await apiRequest<ErrorBody>(context, `/api/projects/${id}/imports/apply`, 'POST', {
      sql: 'DROP TABLE cliente;',
      plan: preview.body.plan,
    })

    expect(applied.response.status).toBe(400)
    expect(applied.body.error.code).toBe('INVALID_SQL')

    const after = await getJson<{ database: DatabaseModel }>(context, `/api/projects/${id}/export`)
    expect(after.body).toEqual(before.body)

    const runs = await getJson<{ runs: unknown[] }>(context, `/api/projects/${id}/imports`)
    expect(runs.body.runs).toEqual([])
  })
})
