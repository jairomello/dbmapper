const assert = require('node:assert/strict');

const {
    parseSQLToTables,
    createUpdateWizardState,
    buildColumnGroups,
    buildRelationshipGroups,
    applyUpdateWizardState
} = require('../app.js');

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
                { name: 'nome', type: 'text', description: 'Nome da cidade', business_terms: ['nome'], reviewed: true }
            ]
        },
        {
            name: 'pedido',
            description: 'Pedidos de venda',
            business_terms: ['pedido'],
            reviewed: false,
            columns: [
                { name: 'id', type: 'serial', description: 'Identificador', business_terms: ['id'], reviewed: true },
                { name: 'status_pedido_id', type: 'int', description: 'Status do pedido', business_terms: ['status'], reviewed: true },
                { name: 'valor_total', type: 'double', description: 'Valor total', business_terms: ['total'], reviewed: true }
            ]
        },
        {
            name: 'status_pedido',
            description: 'Tabela removida no banco novo',
            business_terms: [],
            reviewed: true,
            columns: [
                { name: 'id', type: 'int', description: 'Identificador', business_terms: [], reviewed: true }
            ]
        }
    ]
};

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
`;

const newTables = parseSQLToTables(sql);
const state = createUpdateWizardState(database, newTables);

const cidadesRow = state.tableRows.find(row => row.oldName === 'cidades');
cidadesRow.action = 'rename';
cidadesRow.renameTo = 'cidade';

state.columnGroups = buildColumnGroups(state);

const pedidoGroup = state.columnGroups.find(group => group.oldTableName === 'pedido');
const statusRow = pedidoGroup.rows.find(row => row.oldName === 'status_pedido_id');
statusRow.action = 'rename';
statusRow.renameTo = 'status_id';

const totalRow = pedidoGroup.rows.find(row => row.oldName === 'valor_total');
totalRow.action = 'rename';
totalRow.renameTo = 'total';

const updated = applyUpdateWizardState(database, state);

assert.deepEqual(updated.tables.map(table => table.name), ['cidade', 'pedido', 'tipo_consulta']);

const cidade = updated.tables.find(table => table.name === 'cidade');
assert.equal(cidade.description, 'Cadastro de cidades');
assert.equal(cidade.reviewed, true);
assert.deepEqual(cidade.columns.map(col => col.name), ['id', 'nome', 'estado_id']);
assert.equal(cidade.columns.find(col => col.name === 'nome').description, 'Nome da cidade');
assert.equal(cidade.columns.find(col => col.name === 'estado_id').description, '');
assert.equal(cidade.columns.find(col => col.name === 'estado_id').status, 'NEW');

const pedido = updated.tables.find(table => table.name === 'pedido');
assert.equal(pedido.description, 'Pedidos de venda');
assert.deepEqual(pedido.columns.map(col => col.name), ['id', 'status_id', 'total', 'criado_em']);
assert.equal(pedido.columns.find(col => col.name === 'status_id').description, 'Status do pedido');
assert.equal(pedido.columns.find(col => col.name === 'total').description, 'Valor total');
assert.equal(pedido.columns.find(col => col.name === 'id').type, 'int');
assert.equal(pedido.columns.find(col => col.name === 'id').status, 'CHANGED');
assert.equal(pedido.columns.find(col => col.name === 'criado_em').status, 'NEW');

const tipoConsulta = updated.tables.find(table => table.name === 'tipo_consulta');
assert.equal(tipoConsulta.description, '');
assert.equal(tipoConsulta.reviewed, false);
assert.deepEqual(tipoConsulta.columns.map(col => col.status), ['NEW', 'NEW']);

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
`;

const relationshipTables = parseSQLToTables(relationshipSql);
const parsedPedido = relationshipTables.find(table => table.name === 'pedido');
const parsedCliente = relationshipTables.find(table => table.name === 'cliente');
const parsedItemPedido = relationshipTables.find(table => table.name === 'item_pedido');

assert.equal(parsedCliente.columns.find(col => col.name === 'id').primary_key, true);
assert.equal(parsedPedido.columns.find(col => col.name === 'cliente_id').foreign_key, true);
assert.deepEqual(parsedPedido.relationships.parents, [
    {
        table: 'cliente',
        local_columns: ['cliente_id'],
        referenced_columns: ['id'],
        constraint_name: 'fk_pedido_cliente',
        description: '',
        reviewed: false
    }
]);
assert.deepEqual(parsedCliente.relationships.children, [
    {
        table: 'pedido',
        local_columns: ['id'],
        referenced_columns: ['cliente_id'],
        constraint_name: 'fk_pedido_cliente',
        description: '',
        reviewed: false
    }
]);
assert.deepEqual(parsedItemPedido.relationships.parents[0], {
    table: 'pedido',
    local_columns: ['pedido_id'],
    referenced_columns: ['id'],
    constraint_name: '',
    description: '',
    reviewed: false
});

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
`;

const alterTables = parseSQLToTables(alterRelationshipSql);
const alterAsyncJob = alterTables.find(table => table.name === 'async_job');

assert.equal(alterAsyncJob.relationships.parents.length, 2);
assert.deepEqual(alterAsyncJob.relationships.parents[0], {
    table: 'async_job_tipo',
    local_columns: ['async_job_tipo_id'],
    referenced_columns: ['id'],
    constraint_name: 'fk_async_job_1',
    description: '',
    reviewed: false
});
assert.equal(alterAsyncJob.columns.find(col => col.name === 'async_job_tipo_id').foreign_key, true);

const oldDatabaseWithoutRelationships = {
    name: 'Relacionamentos',
    tables: [
        {
            name: 'cliente',
            columns: [
                { name: 'id', type: 'int' },
                { name: 'nome', type: 'text' }
            ]
        },
        {
            name: 'pedido',
            columns: [
                { name: 'id', type: 'int' },
                { name: 'cliente_id', type: 'int' }
            ]
        }
    ]
};

const fkState = createUpdateWizardState(oldDatabaseWithoutRelationships, relationshipTables.filter(table => table.name !== 'item_pedido'));
fkState.columnGroups = buildColumnGroups(fkState);
fkState.relationshipGroups = buildRelationshipGroups(fkState);

const pedidoRelationships = fkState.relationshipGroups.find(group => group.tableName === 'pedido');
assert.ok(pedidoRelationships, 'deve comparar relacionamentos da tabela pedido');
assert.equal(pedidoRelationships.rows.length, 1);
assert.equal(pedidoRelationships.rows[0].kind, 'newOnly');
assert.equal(pedidoRelationships.rows[0].newRelationship.table, 'cliente');

applyUpdateWizardState(oldDatabaseWithoutRelationships, fkState);
assert.equal(oldDatabaseWithoutRelationships.tables.find(table => table.name === 'pedido').relationships.parents.length, 1);
assert.equal(oldDatabaseWithoutRelationships.tables.find(table => table.name === 'cliente').columns.find(col => col.name === 'id').primary_key, true);
assert.equal(oldDatabaseWithoutRelationships.tables.find(table => table.name === 'pedido').columns.find(col => col.name === 'cliente_id').foreign_key, true);

console.log('update-model.test.js: ok');
