const assert = require('node:assert/strict');

const {
    buildTimestamp,
    stripTimestampPrefix,
    slugifyBaseName,
    resolveBaseName,
    suggestSaveFilename,
    sanitizeUserFilename
} = require('../app.js');

// 1. buildTimestamp zero-pads and uses local getters
{
    const d = new Date(2026, 5, 5, 9, 7);
    assert.equal(buildTimestamp(d), '2026-06-05-09-07');
    const d2 = new Date(2026, 0, 1, 0, 0);
    assert.equal(buildTimestamp(d2), '2026-01-01-00-00');
    const d3 = new Date(2026, 11, 31, 23, 59);
    assert.equal(buildTimestamp(d3), '2026-12-31-23-59');
}

// 2. stripTimestampPrefix strips the leading timestamp
{
    assert.equal(stripTimestampPrefix('2026-06-05-09-07-loja'), 'loja');
    assert.equal(stripTimestampPrefix('2026-06-05-09-07-loja-varejista'), 'loja-varejista');
    assert.equal(stripTimestampPrefix('loja'), 'loja');
    assert.equal(stripTimestampPrefix(''), '');
    assert.equal(stripTimestampPrefix(null), '');
    assert.equal(stripTimestampPrefix('2026-06-05-09-07'), '2026-06-05-09-07');
}

// 3. slugifyBaseName lowercases, trims, hyphenates whitespace
{
    assert.equal(slugifyBaseName('Loja Varejista'), 'loja-varejista');
    assert.equal(slugifyBaseName('  Meu Banco  '), 'meu-banco');
    assert.equal(slugifyBaseName('already-slugified'), 'already-slugified');
    assert.equal(slugifyBaseName(''), '');
    assert.equal(slugifyBaseName(null), '');
}

// 4. resolveBaseName chain: recorded → edited db name → SQL name → "mapper"
{
    assert.equal(
        resolveBaseName({ currentProjectBaseName: 'Loja', projectData: null, sqlDatabaseName: 'sqlx' }),
        'loja'
    );
    assert.equal(
        resolveBaseName({
            currentProjectBaseName: null,
            projectData: { database: { name: 'Meu Banco' } },
            sqlDatabaseName: 'sqlx'
        }),
        'meu-banco'
    );
    assert.equal(
        resolveBaseName({
            currentProjectBaseName: null,
            projectData: { database: { name: 'Novo Banco' } },
            sqlDatabaseName: 'Loja Varejista'
        }),
        'loja-varejista'
    );
    assert.equal(
        resolveBaseName({
            currentProjectBaseName: null,
            projectData: { database: { name: 'Novo Banco' } },
            sqlDatabaseName: null
        }),
        'mapper'
    );
    assert.equal(
        resolveBaseName({ currentProjectBaseName: null, projectData: null, sqlDatabaseName: null }),
        'mapper'
    );
    assert.equal(
        resolveBaseName({ currentProjectBaseName: '', projectData: { database: { name: 'X' } }, sqlDatabaseName: 'sqlx' }),
        'x'
    );
}

// 5. suggestSaveFilename joins timestamp and base
{
    const d = new Date(2026, 5, 5, 21, 7);
    assert.equal(
        suggestSaveFilename({ currentProjectBaseName: 'Loja', projectData: null, sqlDatabaseName: null }, d),
        '2026-06-05-21-07-loja.json'
    );
    assert.equal(
        suggestSaveFilename({ currentProjectBaseName: null, projectData: null, sqlDatabaseName: null }, d),
        '2026-06-05-21-07-mapper.json'
    );
}

// 6. sanitizeUserFilename trims, sanitizes, appends .json
{
    assert.deepEqual(sanitizeUserFilename('2026-06-05-21-07-loja'), { ok: true, filename: '2026-06-05-21-07-loja.json' });
    assert.deepEqual(sanitizeUserFilename('loja.json'), { ok: true, filename: 'loja.json' });
    assert.deepEqual(sanitizeUserFilename('  nome com espaço  '), { ok: true, filename: 'nome-com-espaço.json'.replace('espaço', 'espa-o') });
    // Sanitizer strips non-allowed characters to hyphens
    const dirty = sanitizeUserFilename('a/b\\c*d?e');
    assert.equal(dirty.ok, true);
    assert.equal(dirty.filename, 'a-b-c-d-e.json');
    // Empty input rejected
    const empty = sanitizeUserFilename('   ');
    assert.equal(empty.ok, false);
    // Whitespace-only is rejected, not just empty
    const tabs = sanitizeUserFilename('\t\n');
    assert.equal(tabs.ok, false);
}

console.log('project-persistence.test.js: ok');
