import { describe, expect, test } from 'bun:test'
import { normalizeRelationships, parseAlterTableForeignKeys, parseSQLToTables } from './parser'

describe('sql-import (contrato v1 portado)', () => {
  test('1. extrai nome e tipo das colunas', () => {
    const tables = parseSQLToTables('CREATE TABLE pessoa (id int, nome text);')
    expect(tables.length).toBe(1)
    expect(tables[0].name).toBe('pessoa')
    const cols = tables[0].columns
    expect(cols.length).toBe(2)
    expect(cols[0].name).toBe('id')
    expect(cols[0].type).toBe('int')
    expect(cols[1].name).toBe('nome')
    expect(cols[1].type).toBe('text')
  })

  test('2. primary key inline', () => {
    const tables = parseSQLToTables('CREATE TABLE t (id int PRIMARY KEY, nome text);')
    const cols = tables[0].columns
    expect(cols.find((c) => c.name === 'id')?.primary_key).toBe(true)
    expect(cols.find((c) => c.name === 'nome')?.primary_key).toBe(false)
  })

  test('3. foreign key inline via REFERENCES na coluna', () => {
    const sql = 'CREATE TABLE pedido (id int, cliente_id int REFERENCES cliente (id));'
    const tables = parseSQLToTables(sql)
    const cols = tables[0].columns
    expect(cols.find((c) => c.name === 'cliente_id')?.foreign_key).toBe(true)
    expect(tables[0].relationships.parents.length).toBe(1)
    expect(tables[0].relationships.parents[0].table).toBe('cliente')
    expect(tables[0].relationships.parents[0].local_columns).toEqual(['cliente_id'])
    expect(tables[0].relationships.parents[0].referenced_columns).toEqual(['id'])
  })

  test('4. constraint FOREIGN KEY nomeada', () => {
    const sql = `
        CREATE TABLE pedido (
            id int,
            cliente_id int,
            CONSTRAINT fk_pedido_cliente FOREIGN KEY (cliente_id) REFERENCES cliente (id)
        );
    `
    const tables = parseSQLToTables(sql)
    const rel = tables[0].relationships.parents[0]
    expect(rel.table).toBe('cliente')
    expect(rel.local_columns).toEqual(['cliente_id'])
    expect(rel.referenced_columns).toEqual(['id'])
    expect(rel.constraint_name).toBe('fk_pedido_cliente')
  })

  test('5. identificadores quotados e qualificados por schema', () => {
    const sql = 'CREATE TABLE "public"."users" ("id" int, `email` text);'
    const tables = parseSQLToTables(sql)
    expect(tables[0].name).toBe('users')
    expect(tables[0].columns[0].name).toBe('id')
    expect(tables[0].columns[1].name).toBe('email')
  })

  test('6. tipos com parênteses e vírgula interna não são divididos', () => {
    const tables = parseSQLToTables('CREATE TABLE t (valor decimal(10,2));')
    expect(tables[0].columns.length).toBe(1)
    expect(tables[0].columns[0].name).toBe('valor')
    expect(tables[0].columns[0].type).toBe('decimal(10,2)')
  })

  test('7. ALTER TABLE adiciona duas FKs', () => {
    const sql = `
        CREATE TABLE async_job (
            id serial,
            async_job_tipo_id integer,
            async_job_status_id integer
        );
        ALTER TABLE async_job ADD CONSTRAINT fk_async_job_1 FOREIGN KEY (async_job_tipo_id) references async_job_tipo(id);
        ALTER TABLE async_job ADD CONSTRAINT fk_async_job_2 FOREIGN KEY (async_job_status_id) references async_job_status(id);
    `
    const tables = parseSQLToTables(sql)
    const asyncJob = tables.find((t) => t.name === 'async_job')!
    expect(asyncJob.relationships.parents.length).toBe(2)
    expect(asyncJob.relationships.parents[0].table).toBe('async_job_tipo')
    expect(asyncJob.relationships.parents[0].constraint_name).toBe('fk_async_job_1')
    expect(asyncJob.relationships.parents[1].table).toBe('async_job_status')
    expect(asyncJob.relationships.parents[1].constraint_name).toBe('fk_async_job_2')
    expect(asyncJob.columns.find((c) => c.name === 'async_job_tipo_id')?.foreign_key).toBe(true)
    expect(asyncJob.columns.find((c) => c.name === 'async_job_status_id')?.foreign_key).toBe(true)
  })

  test('8. ALTER TABLE em tabela ausente é ignorado', () => {
    const sql = `
        CREATE TABLE present (id int);
        ALTER TABLE missing ADD CONSTRAINT fk_x FOREIGN KEY (id) REFERENCES other (id);
    `
    const tables = parseSQLToTables(sql)
    expect(tables.length).toBe(1)
    expect(tables[0].name).toBe('present')
    expect(tables[0].relationships.parents.length).toBe(0)
  })

  test('9. normalização pai/filho é bidirecional', () => {
    const sql = `
        CREATE TABLE cliente (id int, PRIMARY KEY (id));
        CREATE TABLE pedido (id int, cliente_id int REFERENCES cliente (id));
    `
    const tables = parseSQLToTables(sql)
    const cliente = tables.find((t) => t.name === 'cliente')!
    const pedido = tables.find((t) => t.name === 'pedido')!
    expect(pedido.relationships.parents.length).toBe(1)
    expect(cliente.relationships.children.length).toBe(1)
    expect(cliente.relationships.children[0].table).toBe('pedido')
    expect(cliente.relationships.children[0].local_columns).toEqual(['id'])
    expect(cliente.relationships.children[0].referenced_columns).toEqual(['cliente_id'])
  })

  test('10. relacionamentos duplicados são deduplicados', () => {
    const sql = `
        CREATE TABLE a (id int, b_id int);
        CREATE TABLE b (id int);
        ALTER TABLE a ADD CONSTRAINT fk_1 FOREIGN KEY (b_id) REFERENCES b (id);
        ALTER TABLE a ADD CONSTRAINT fk_2 FOREIGN KEY (b_id) REFERENCES b (id);
    `
    const tables = parseSQLToTables(sql)
    const a = tables.find((t) => t.name === 'a')!
    const b = tables.find((t) => t.name === 'b')!
    expect(a.relationships.parents.length).toBe(1)
    expect(b.relationships.children.length).toBe(1)
  })

  test('11. parseAlterTableForeignKeys e normalizeRelationships são chamáveis diretamente', () => {
    const tables = [
      {
        name: 'x',
        description: '',
        business_terms: [],
        reviewed: false,
        status: 'NEW' as const,
        columns: [],
        relationships: { parents: [], children: [] },
      },
    ]
    parseAlterTableForeignKeys('ALTER TABLE x ADD CONSTRAINT fk1 FOREIGN KEY (y) REFERENCES z (w);', tables)
    expect(tables[0].relationships.parents.length).toBe(1)
    normalizeRelationships(tables)
    expect(tables[0].columns.length).toBe(0)
    expect(tables[0].relationships.parents.length).toBe(1)
  })
})
