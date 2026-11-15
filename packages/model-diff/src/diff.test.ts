import type { DatabaseModel } from '@dbmapper/domain'
import { parseSQLToTables } from '@dbmapper/sql-parser'
import { describe, expect, test } from 'bun:test'
import {
  applyUpdateWizardState,
  buildColumnGroups,
  buildRelationshipGroups,
  createUpdateWizardState,
} from './diff'

const database = {
  name: 'Teste',
  description: 'Modelo atual',
  business_terms: ['core'],
  reviewed: false,
  tables: [
    {
      name: 'cidades',
      description: 'Cadastro de cidades',
      business_terms: ['cidade'],
      reviewed: true,
      columns: [
        { name: 'id', type: 'int', description: 'Identificador', business_terms: ['id'], reviewed: true },
        { name: 'nome', type: 'text', description: 'Nome da cidade', business_terms: ['nome'], reviewed: true },
      ],
    },
    {
      name: 'pedido',
      description: 'Pedidos de venda',
      business_terms: ['pedido'],
      reviewed: false,
      columns: [
        { name: 'id', type: 'serial', description: 'Identificador', business_terms: ['id'], reviewed: true },
        {
          name: 'status_pedido_id',
          type: 'int',
          description: 'Status do pedido',
          business_terms: ['status'],
          reviewed: true,
        },
        { name: 'valor_total', type: 'double', description: 'Valor total', business_terms: ['total'], reviewed: true },
      ],
    },
    {
      name: 'status_pedido',
      description: 'Tabela removida no banco novo',
      business_terms: [],
      reviewed: true,
      columns: [{ name: 'id', type: 'int', description: 'Identificador', business_terms: [], reviewed: true }],
    },
  ],
} as DatabaseModel

const sql = `
CREATE TABLE cidade (
    id int,
    nome text,
    estado_id int
);

CREATE TABLE pedido (
    id int,
    status_id int,
    total decimal(10,2),
    criado_em timestamp
);

CREATE TABLE tipo_consulta (
    id int,
    nome text
);
`

describe('update-model (contrato v1 portado)', () => {
  test('renomeia tabela e colunas preservando metadados e classifica itens novos/alterados', () => {
    const newTables = parseSQLToTables(sql)
    const state = createUpdateWizardState(database, newTables)

    const cidadesRow = state.tableRows.find((row) => row.oldName === 'cidades')!
    cidadesRow.action = 'rename'
    cidadesRow.renameTo = 'cidade'

    state.columnGroups = buildColumnGroups(state)

    const pedidoGroup = state.columnGroups.find((group) => group.oldTableName === 'pedido')!
    const statusRow = pedidoGroup.rows.find((row) => row.oldName === 'status_pedido_id')!
    statusRow.action = 'rename'
    statusRow.renameTo = 'status_id'

    const totalRow = pedidoGroup.rows.find((row) => row.oldName === 'valor_total')!
    totalRow.action = 'rename'
    totalRow.renameTo = 'total'

    const updated = applyUpdateWizardState(database, state)

    expect(updated.tables.map((table) => table.name)).toEqual(['cidade', 'pedido', 'tipo_consulta'])

    const cidade = updated.tables.find((table) => table.name === 'cidade')!
    expect(cidade.description).toBe('Cadastro de cidades')
    expect(cidade.reviewed).toBe(true)
    expect(cidade.columns.map((col) => col.name)).toEqual(['id', 'nome', 'estado_id'])
    expect(cidade.columns.find((col) => col.name === 'nome')!.description).toBe('Nome da cidade')
    expect(cidade.columns.find((col) => col.name === 'estado_id')!.description).toBe('')
    expect(cidade.columns.find((col) => col.name === 'estado_id')!.status).toBe('NEW')

    const pedido = updated.tables.find((table) => table.name === 'pedido')!
    expect(pedido.description).toBe('Pedidos de venda')
    expect(pedido.columns.map((col) => col.name)).toEqual(['id', 'status_id', 'total', 'criado_em'])
    expect(pedido.columns.find((col) => col.name === 'status_id')!.description).toBe('Status do pedido')
    expect(pedido.columns.find((col) => col.name === 'total')!.description).toBe('Valor total')
    expect(pedido.columns.find((col) => col.name === 'id')!.type).toBe('int')
    expect(pedido.columns.find((col) => col.name === 'id')!.status).toBe('CHANGED')
    expect(pedido.columns.find((col) => col.name === 'criado_em')!.status).toBe('NEW')

    const tipoConsulta = updated.tables.find((table) => table.name === 'tipo_consulta')!
    expect(tipoConsulta.description).toBe('')
    expect(tipoConsulta.reviewed).toBe(false)
    expect(tipoConsulta.columns.map((col) => col.status)).toEqual(['NEW', 'NEW'])
  })

  test('normaliza relacionamentos pai/filho e FKs via ALTER TABLE', () => {
    const relationshipSql = `
CREATE TABLE cliente (
    id int,
    nome text,
    PRIMARY KEY (id)
);

CREATE TABLE pedido (
    id int PRIMARY KEY,
    cliente_id int,
    CONSTRAINT fk_pedido_cliente FOREIGN KEY (cliente_id) REFERENCES cliente (id)
);

CREATE TABLE item_pedido (
    id int PRIMARY KEY,
    pedido_id int REFERENCES pedido (id)
);
`

    const relationshipTables = parseSQLToTables(relationshipSql)
    const parsedPedido = relationshipTables.find((table) => table.name === 'pedido')!
    const parsedCliente = relationshipTables.find((table) => table.name === 'cliente')!
    const parsedItemPedido = relationshipTables.find((table) => table.name === 'item_pedido')!

    expect(parsedCliente.columns.find((col) => col.name === 'id')!.primary_key).toBe(true)
    expect(parsedPedido.columns.find((col) => col.name === 'cliente_id')!.foreign_key).toBe(true)
    expect(parsedPedido.relationships.parents).toEqual([
      {
        table: 'cliente',
        local_columns: ['cliente_id'],
        referenced_columns: ['id'],
        constraint_name: 'fk_pedido_cliente',
        description: '',
        reviewed: false,
      },
    ])
    expect(parsedCliente.relationships.children).toEqual([
      {
        table: 'pedido',
        local_columns: ['id'],
        referenced_columns: ['cliente_id'],
        constraint_name: 'fk_pedido_cliente',
        description: '',
        reviewed: false,
      },
    ])
    expect(parsedItemPedido.relationships.parents[0]).toEqual({
      table: 'pedido',
      local_columns: ['pedido_id'],
      referenced_columns: ['id'],
      constraint_name: '',
      description: '',
      reviewed: false,
    })

    const alterRelationshipSql = `
CREATE TABLE async_job (
    id serial,
    async_job_tipo_id integer,
    async_job_status_id integer,
    PRIMARY KEY (id)
);

CREATE TABLE async_job_tipo (
    id serial,
    PRIMARY KEY (id)
);

CREATE TABLE async_job_status (
    id serial,
    PRIMARY KEY (id)
);

ALTER TABLE async_job ADD CONSTRAINT fk_async_job_1 FOREIGN KEY (async_job_tipo_id) references async_job_tipo(id);
ALTER TABLE async_job ADD CONSTRAINT fk_async_job_2 FOREIGN KEY (async_job_status_id) references async_job_status(id);
`

    const alterTables = parseSQLToTables(alterRelationshipSql)
    const alterAsyncJob = alterTables.find((table) => table.name === 'async_job')!

    expect(alterAsyncJob.relationships.parents.length).toBe(2)
    expect(alterAsyncJob.relationships.parents[0]).toEqual({
      table: 'async_job_tipo',
      local_columns: ['async_job_tipo_id'],
      referenced_columns: ['id'],
      constraint_name: 'fk_async_job_1',
      description: '',
      reviewed: false,
    })
    expect(alterAsyncJob.columns.find((col) => col.name === 'async_job_tipo_id')!.foreign_key).toBe(true)
  })

  test('compara relacionamentos novos quando o modelo antigo não tinha FKs', () => {
    const relationshipSql = `
CREATE TABLE cliente (
    id int,
    nome text,
    PRIMARY KEY (id)
);

CREATE TABLE pedido (
    id int PRIMARY KEY,
    cliente_id int,
    CONSTRAINT fk_pedido_cliente FOREIGN KEY (cliente_id) REFERENCES cliente (id)
);

CREATE TABLE item_pedido (
    id int PRIMARY KEY,
    pedido_id int REFERENCES pedido (id)
);
`
    const relationshipTables = parseSQLToTables(relationshipSql)

    const oldDatabaseWithoutRelationships = {
      name: 'Relacionamentos',
      tables: [
        {
          name: 'cliente',
          columns: [
            { name: 'id', type: 'int' },
            { name: 'nome', type: 'text' },
          ],
        },
        {
          name: 'pedido',
          columns: [
            { name: 'id', type: 'int' },
            { name: 'cliente_id', type: 'int' },
          ],
        },
      ],
    } as unknown as DatabaseModel

    const fkState = createUpdateWizardState(
      oldDatabaseWithoutRelationships,
      relationshipTables.filter((table) => table.name !== 'item_pedido'),
    )
    fkState.columnGroups = buildColumnGroups(fkState)
    fkState.relationshipGroups = buildRelationshipGroups(fkState)

    const pedidoRelationships = fkState.relationshipGroups.find((group) => group.tableName === 'pedido')
    expect(pedidoRelationships).toBeTruthy()
    expect(pedidoRelationships!.rows.length).toBe(1)
    expect(pedidoRelationships!.rows[0].kind).toBe('newOnly')
    expect(pedidoRelationships!.rows[0].newRelationship!.table).toBe('cliente')

    applyUpdateWizardState(oldDatabaseWithoutRelationships, fkState)
    expect(
      oldDatabaseWithoutRelationships.tables.find((table) => table.name === 'pedido')!.relationships.parents.length,
    ).toBe(1)
    expect(
      oldDatabaseWithoutRelationships.tables
        .find((table) => table.name === 'cliente')!
        .columns.find((col) => col.name === 'id')!.primary_key,
    ).toBe(true)
    expect(
      oldDatabaseWithoutRelationships.tables
        .find((table) => table.name === 'pedido')!
        .columns.find((col) => col.name === 'cliente_id')!.foreign_key,
    ).toBe(true)
  })
})
