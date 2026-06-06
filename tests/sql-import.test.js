const assert = require('node:assert/strict');

const {
    parseSQLToTables,
    parseAlterTableForeignKeys,
    normalizeRelationships
} = require('../app.js');

// 1. Column extraction (name + type)
{
    const tables = parseSQLToTables('CREATE TABLE pessoa (id int, nome text);');
    assert.equal(tables.length, 1);
    assert.equal(tables[0].name, 'pessoa');
    const cols = tables[0].columns;
    assert.equal(cols.length, 2);
    assert.equal(cols[0].name, 'id');
    assert.equal(cols[0].type, 'int');
    assert.equal(cols[1].name, 'nome');
    assert.equal(cols[1].type, 'text');
}

// 2. Inline primary key
{
    const tables = parseSQLToTables('CREATE TABLE t (id int PRIMARY KEY, nome text);');
    const cols = tables[0].columns;
    assert.equal(cols.find(c => c.name === 'id').primary_key, true);
    assert.equal(cols.find(c => c.name === 'nome').primary_key, false);
}

// 3. Inline foreign key via column-level REFERENCES
{
    const sql = 'CREATE TABLE pedido (id int, cliente_id int REFERENCES cliente (id));';
    const tables = parseSQLToTables(sql);
    const cols = tables[0].columns;
    assert.equal(cols.find(c => c.name === 'cliente_id').foreign_key, true);
    assert.equal(tables[0].relationships.parents.length, 1);
    assert.equal(tables[0].relationships.parents[0].table, 'cliente');
    assert.deepEqual(tables[0].relationships.parents[0].local_columns, ['cliente_id']);
    assert.deepEqual(tables[0].relationships.parents[0].referenced_columns, ['id']);
}

// 4. Named FOREIGN KEY constraint
{
    const sql = `
        CREATE TABLE pedido (
            id int,
            cliente_id int,
            CONSTRAINT fk_pedido_cliente FOREIGN KEY (cliente_id) REFERENCES cliente (id)
        );
    `;
    const tables = parseSQLToTables(sql);
    const rel = tables[0].relationships.parents[0];
    assert.equal(rel.table, 'cliente');
    assert.deepEqual(rel.local_columns, ['cliente_id']);
    assert.deepEqual(rel.referenced_columns, ['id']);
    assert.equal(rel.constraint_name, 'fk_pedido_cliente');
}

// 5. Quoted identifiers and schema-qualified names
{
    const sql = 'CREATE TABLE "public"."users" ("id" int, `email` text);';
    const tables = parseSQLToTables(sql);
    assert.equal(tables[0].name, 'users');
    assert.equal(tables[0].columns[0].name, 'id');
    assert.equal(tables[0].columns[1].name, 'email');
}

// 6. Parenthesised types with commas (must not be split on the inner comma)
{
    const tables = parseSQLToTables('CREATE TABLE t (valor decimal(10,2));');
    assert.equal(tables[0].columns.length, 1);
    assert.equal(tables[0].columns[0].name, 'valor');
    assert.equal(tables[0].columns[0].type, 'decimal(10,2)');
}

// 7. ALTER TABLE adds two FKs
{
    const sql = `
        CREATE TABLE async_job (
            id serial,
            async_job_tipo_id integer,
            async_job_status_id integer
        );
        ALTER TABLE async_job ADD CONSTRAINT fk_async_job_1 FOREIGN KEY (async_job_tipo_id) references async_job_tipo(id);
        ALTER TABLE async_job ADD CONSTRAINT fk_async_job_2 FOREIGN KEY (async_job_status_id) references async_job_status(id);
    `;
    const tables = parseSQLToTables(sql);
    const asyncJob = tables.find(t => t.name === 'async_job');
    assert.equal(asyncJob.relationships.parents.length, 2);
    assert.equal(asyncJob.relationships.parents[0].table, 'async_job_tipo');
    assert.equal(asyncJob.relationships.parents[0].constraint_name, 'fk_async_job_1');
    assert.equal(asyncJob.relationships.parents[1].table, 'async_job_status');
    assert.equal(asyncJob.relationships.parents[1].constraint_name, 'fk_async_job_2');
    assert.equal(asyncJob.columns.find(c => c.name === 'async_job_tipo_id').foreign_key, true);
    assert.equal(asyncJob.columns.find(c => c.name === 'async_job_status_id').foreign_key, true);
}

// 8. ALTER TABLE on a missing table is silently skipped
{
    const sql = `
        CREATE TABLE present (id int);
        ALTER TABLE missing ADD CONSTRAINT fk_x FOREIGN KEY (id) REFERENCES other (id);
    `;
    const tables = parseSQLToTables(sql);
    assert.equal(tables.length, 1);
    assert.equal(tables[0].name, 'present');
    assert.equal(tables[0].relationships.parents.length, 0);
}

// 9. Parent/child bidirectional normalization
{
    const sql = `
        CREATE TABLE cliente (id int, PRIMARY KEY (id));
        CREATE TABLE pedido (id int, cliente_id int REFERENCES cliente (id));
    `;
    const tables = parseSQLToTables(sql);
    const cliente = tables.find(t => t.name === 'cliente');
    const pedido = tables.find(t => t.name === 'pedido');
    assert.equal(pedido.relationships.parents.length, 1);
    assert.equal(cliente.relationships.children.length, 1);
    assert.equal(cliente.relationships.children[0].table, 'pedido');
    assert.deepEqual(cliente.relationships.children[0].local_columns, ['id']);
    assert.deepEqual(cliente.relationships.children[0].referenced_columns, ['cliente_id']);
}

// 10. Duplicate relationships are deduplicated
{
    // Two ALTER TABLE statements creating the same FK on the same table.
    const sql = `
        CREATE TABLE a (id int, b_id int);
        CREATE TABLE b (id int);
        ALTER TABLE a ADD CONSTRAINT fk_1 FOREIGN KEY (b_id) REFERENCES b (id);
        ALTER TABLE a ADD CONSTRAINT fk_2 FOREIGN KEY (b_id) REFERENCES b (id);
    `;
    const tables = parseSQLToTables(sql);
    const a = tables.find(t => t.name === 'a');
    const b = tables.find(t => t.name === 'b');
    assert.equal(a.relationships.parents.length, 1);
    assert.equal(b.relationships.children.length, 1);
}

// 11. parseAlterTableForeignKeys and normalizeRelationships are callable directly
{
    const tables = [
        {
            name: 'x',
            columns: [],
            relationships: { parents: [], children: [] }
        }
    ];
    parseAlterTableForeignKeys('ALTER TABLE x ADD CONSTRAINT fk1 FOREIGN KEY (y) REFERENCES z (w);', tables);
    assert.equal(tables[0].relationships.parents.length, 1);
    normalizeRelationships(tables);
    assert.equal(tables[0].columns.length, 0);
    assert.equal(tables[0].relationships.parents.length, 1);
}

console.log('sql-import.test.js: ok');
