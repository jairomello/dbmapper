const assert = require('node:assert/strict');

const { normalizeRelationships, computeStats, setProjectData } = require('../app.js');

function makeDb(tables) {
    return { name: 'Teste', description: '', business_terms: [], reviewed: false, tables };
}

function makeTable(name, opts = {}) {
    return {
        name,
        description: opts.description || '',
        business_terms: [],
        reviewed: opts.reviewed ?? false,
        status: opts.status || 'UNCHANGED',
        columns: opts.columns || [],
        relationships: opts.relationships || { parents: [], children: [] }
    };
}

function makeParent(table, locals, refs, opts = {}) {
    return {
        table,
        local_columns: locals,
        referenced_columns: refs,
        constraint_name: opts.constraint_name || '',
        description: opts.description || '',
        reviewed: opts.reviewed ?? false
    };
}

// 1. No FKs
{
    const db = makeDb([
        makeTable('a', { columns: [{ name: 'id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' }] })
    ]);
    setProjectData({ database: db });
    const s = computeStats();
    assert.equal(s.totalFks, 0);
    assert.equal(s.fksDesc, 0);
    assert.equal(s.fksRev, 0);
}

// 2. All-undescribed FKs
{
    const db = makeDb([
        makeTable('pedido', {
            columns: [
                { name: 'id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' },
                { name: 'cliente_id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' }
            ],
            relationships: { parents: [makeParent('cliente', ['cliente_id'], ['id'])], children: [] }
        }),
        makeTable('cliente', {
            columns: [{ name: 'id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' }],
            relationships: { parents: [], children: [] }
        })
    ]);
    normalizeRelationships(db.tables);
    setProjectData({ database: db });
    const s = computeStats();
    assert.equal(s.totalFks, 1);
    assert.equal(s.fksDesc, 0);
    assert.equal(s.fksRev, 0);
}

// 3. Mixed: one described (not reviewed), one reviewed, one untouched
{
    const db = makeDb([
        makeTable('pedido', {
            columns: [
                { name: 'id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' },
                { name: 'a_id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' },
                { name: 'b_id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' },
                { name: 'c_id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' }
            ],
            relationships: {
                parents: [
                    makeParent('a', ['a_id'], ['id'], { description: 'lookup to A' }),
                    makeParent('b', ['b_id'], ['id'], { description: 'lookup to B', reviewed: true }),
                    makeParent('c', ['c_id'], ['id'])
                ],
                children: []
            }
        }),
        makeTable('a', { columns: [{ name: 'id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' }], relationships: { parents: [], children: [] } }),
        makeTable('b', { columns: [{ name: 'id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' }], relationships: { parents: [], children: [] } }),
        makeTable('c', { columns: [{ name: 'id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' }], relationships: { parents: [], children: [] } })
    ]);
    normalizeRelationships(db.tables);
    setProjectData({ database: db });
    const s = computeStats();
    assert.equal(s.totalFks, 3);
    assert.equal(s.fksDesc, 2);
    assert.equal(s.fksRev, 1);
}

// 4. FKs on a REMOVED table are not counted
{
    const db = makeDb([
        makeTable('alive', {
            columns: [{ name: 'id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' }],
            relationships: { parents: [makeParent('ghost', ['id'], ['id'])], children: [] }
        }),
        makeTable('ghost', {
            status: 'REMOVED',
            columns: [{ name: 'id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' }],
            relationships: { parents: [], children: [] }
        })
    ]);
    normalizeRelationships(db.tables);
    setProjectData({ database: db });
    const s = computeStats();
    assert.equal(s.totalFks, 1);
}

// 5. Whitespace-only description does not count as described
{
    const db = makeDb([
        makeTable('a', {
            columns: [{ name: 'id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' }],
            relationships: { parents: [makeParent('b', ['id'], ['id'], { description: '   ' })], children: [] }
        }),
        makeTable('b', { columns: [{ name: 'id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' }], relationships: { parents: [], children: [] } })
    ]);
    normalizeRelationships(db.tables);
    setProjectData({ database: db });
    const s = computeStats();
    assert.equal(s.totalFks, 1);
    assert.equal(s.fksDesc, 0);
    assert.equal(s.fksRev, 0);
}

// 6. Backfill on normalize: relationship without description/reviewed is normalized to ''
{
    const tables = [
        makeTable('a', {
            columns: [{ name: 'id', type: 'int', description: '', business_terms: [], reviewed: false, status: 'UNCHANGED' }],
            relationships: { parents: [{ table: 'b', local_columns: ['id'], referenced_columns: ['id'], constraint_name: '' }], children: [] }
        })
    ];
    normalizeRelationships(tables);
    assert.equal(tables[0].relationships.parents[0].description, '');
    assert.equal(tables[0].relationships.parents[0].reviewed, false);
}

console.log('coverage-stats.test.js: ok');
