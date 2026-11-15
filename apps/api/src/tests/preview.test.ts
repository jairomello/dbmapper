import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { ImportPlan } from '../services/model-import'
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

const classificationDatabase: DatabaseModel = {
  name: 'Classificação',
  description: '',
  business_terms: [],
  reviewed: false,
  tables: [
    {
      name: 'cliente',
      description: 'Clientes',
      business_terms: [],
      reviewed: false,
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
          reviewed: false,
          status: 'UNCHANGED',
        },
        {
          name: 'nome',
          type: 'text',
          primary_key: false,
          foreign_key: false,
          description: '',
          business_terms: [],
          reviewed: false,
          status: 'UNCHANGED',
        },
        {
          name: 'email',
          type: 'text',
          primary_key: false,
          foreign_key: false,
          description: '',
          business_terms: [],
          reviewed: false,
          status: 'UNCHANGED',
        },
      ],
    },
    {
      name: 'pedido',
      description: '',
      business_terms: [],
      reviewed: false,
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
          reviewed: false,
          status: 'UNCHANGED',
        },
        {
          name: 'cliente_id',
          type: 'int',
          primary_key: false,
          foreign_key: false,
          description: '',
          business_terms: [],
          reviewed: false,
          status: 'UNCHANGED',
        },
        {
          name: 'legacy',
          type: 'text',
          primary_key: false,
          foreign_key: false,
          description: '',
          business_terms: [],
          reviewed: false,
          status: 'UNCHANGED',
        },
      ],
    },
    {
      name: 'categoria',
      description: '',
      business_terms: [],
      reviewed: false,
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
          reviewed: false,
          status: 'UNCHANGED',
        },
      ],
    },
  ],
}

const classificationSql = `
CREATE TABLE cliente (id int, nome varchar, email text);
CREATE TABLE pedido (id int, cliente_id int REFERENCES cliente (id));
CREATE TABLE produto (id int);
`

describe('model-import: preview', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('parseia o schema completo com constraints, quotes, decimal e ALTER TABLE', async () => {
    const created = await apiRequest<{ id: string }>(context, '/api/projects', 'POST', { name: 'Completo' })
    const sql = `
CREATE TABLE "public"."cliente" (id int PRIMARY KEY, nome text);
CREATE TABLE pedido (
  id int,
  cliente_id int,
  valor decimal(10,2),
  CONSTRAINT fk_pedido_cliente FOREIGN KEY (cliente_id) REFERENCES cliente (id)
);
ALTER TABLE pedido ADD CONSTRAINT fk_pedido_cliente_2 FOREIGN KEY (cliente_id) REFERENCES cliente (id);
`

    const { response, body } = await apiRequest<{ plan: ImportPlan }>(
      context,
      `/api/projects/${created.body.id}/imports/preview`,
      'POST',
      { sql },
    )

    expect(response.status).toBe(200)
    expect(body.plan.tables.added).toEqual(['cliente', 'pedido'])
    expect(body.plan.columns.added).toContainEqual({ table: 'pedido', name: 'valor', type: 'decimal(10,2)' })
    expect(body.plan.relationships.added).toHaveLength(1)
    expect(body.plan.relationships.added[0]).toMatchObject({
      table: 'pedido',
      target: 'cliente',
      local_columns: ['cliente_id'],
      referenced_columns: ['id'],
    })
  })

  test('SQL sem CREATE TABLE retorna 400 e não altera o modelo', async () => {
    const id = await seedProject(context, sampleDatabase())
    const before = await getJson<{ database: DatabaseModel }>(context, `/api/projects/${id}/export`)

    const { response, body } = await apiRequest<ErrorBody>(
      context,
      `/api/projects/${id}/imports/preview`,
      'POST',
      { sql: 'SELECT 1;' },
    )

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('INVALID_SQL')
    expect(body.error.retryable).toBe(false)

    const after = await getJson<{ database: DatabaseModel }>(context, `/api/projects/${id}/export`)
    expect(after.body).toEqual(before.body)

    const runs = await getJson<{ runs: unknown[] }>(context, `/api/projects/${id}/imports`)
    expect(runs.body.runs).toEqual([])
  })

  test('ignora DDL fora do subconjunto v1 sem falhar', async () => {
    const created = await apiRequest<{ id: string }>(context, '/api/projects', 'POST', { name: 'Skip' })
    const sql = `
CREATE TABLE t (
  id int,
  nome text,
  CHECK (id > 0),
  UNIQUE (nome)
);
CREATE INDEX idx_t ON t(id);
CREATE VIEW v AS SELECT * FROM t;
ALTER TABLE t ADD COLUMN extra text;
`

    const { response, body } = await apiRequest<{ plan: ImportPlan }>(
      context,
      `/api/projects/${created.body.id}/imports/preview`,
      'POST',
      { sql },
    )

    expect(response.status).toBe(200)
    expect(body.plan.tables.added).toEqual(['t'])
    expect(body.plan.columns.added.map((column) => column.name)).toEqual(['id', 'nome'])
  })

  test('classifica adições, remoções, mudança de tipo e nova FK sem mutar o projeto', async () => {
    const id = await seedProject(context, classificationDatabase)
    const before = await getJson<{ database: DatabaseModel }>(context, `/api/projects/${id}/export`)

    const preview = await apiRequest<{ plan: ImportPlan }>(
      context,
      `/api/projects/${id}/imports/preview`,
      'POST',
      { sql: classificationSql },
    )

    expect(preview.response.status).toBe(200)
    const plan = preview.body.plan

    expect(plan.tables.kept).toEqual(['cliente', 'pedido'])
    expect(plan.tables.removed).toEqual(['categoria'])
    expect(plan.tables.added).toEqual(['produto'])
    expect(plan.columns.changed).toContainEqual({
      table: 'cliente',
      name: 'nome',
      from: 'text',
      to: 'varchar',
    })
    expect(plan.columns.removed).toContainEqual({ table: 'pedido', name: 'legacy' })
    expect(plan.columns.added).toContainEqual({ table: 'produto', name: 'id', type: 'int' })
    expect(plan.relationships.added).toEqual([
      {
        table: 'pedido',
        target: 'cliente',
        local_columns: ['cliente_id'],
        referenced_columns: ['id'],
        constraint_name: '',
      },
    ])

    const after = await getJson<{ database: DatabaseModel }>(context, `/api/projects/${id}/export`)
    expect(after.body).toEqual(before.body)

    const runs = await getJson<{ runs: unknown[] }>(context, `/api/projects/${id}/imports`)
    expect(runs.body.runs).toEqual([])
  })

  test('só classifica rename com mapeamento explícito do cliente', async () => {
    const id = await seedProject(context, {
      name: 'Renames',
      description: '',
      business_terms: [],
      reviewed: false,
      tables: [
        {
          name: 'cidades',
          description: 'Cadastro de cidades',
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
              description: 'ID',
              business_terms: [],
              reviewed: true,
              status: 'UNCHANGED',
            },
            {
              name: 'nome',
              type: 'text',
              primary_key: false,
              foreign_key: false,
              description: 'Nome',
              business_terms: [],
              reviewed: true,
              status: 'UNCHANGED',
            },
          ],
        },
      ],
    })
    const sql = 'CREATE TABLE cidade (id int, nome text, estado_id int);'

    const inferred = await apiRequest<{ plan: ImportPlan }>(
      context,
      `/api/projects/${id}/imports/preview`,
      'POST',
      { sql },
    )
    expect(inferred.body.plan.tables.removed).toEqual(['cidades'])
    expect(inferred.body.plan.tables.added).toEqual(['cidade'])
    expect(inferred.body.plan.tables.renamed).toEqual([])

    const explicit = await apiRequest<{ plan: ImportPlan }>(
      context,
      `/api/projects/${id}/imports/preview`,
      'POST',
      { sql, renames: { tables: [{ from: 'cidades', to: 'cidade' }] } },
    )
    expect(explicit.response.status).toBe(200)
    expect(explicit.body.plan.tables.renamed).toEqual([{ from: 'cidades', to: 'cidade' }])
    expect(explicit.body.plan.tables.removed).toEqual([])
    expect(explicit.body.plan.tables.added).toEqual([])
  })

  test('mapeamento de rename inválido retorna 400', async () => {
    const id = await seedProject(context, sampleDatabase())

    const { response, body } = await apiRequest<ErrorBody>(
      context,
      `/api/projects/${id}/imports/preview`,
      'POST',
      {
        sql: 'CREATE TABLE outra (id int);',
        renames: { tables: [{ from: 'inexistente', to: 'outra' }] },
      },
    )

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('INVALID_RENAME_MAPPING')
  })
})
