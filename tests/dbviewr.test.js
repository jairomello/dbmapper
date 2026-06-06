const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('dbviewr.html', 'utf8');

assert.match(html, /<title>DBViewr - Dicionário de Dados<\/title>/);
assert.match(html, /id="json-input"/);
assert.match(html, /id="search-input"/);
assert.match(html, /id="table-nav"/);
assert.match(html, /id="content"/);
assert.match(html, /id="theme-toggle"/);
assert.match(html, /body\.theme-dark/);
assert.match(html, /function normalizeProject\(json\)/);
assert.match(html, /function computeStats\(db\)/);
assert.match(html, /function renderTable\(table\)/);
assert.match(html, /function renderRelationships\(table\)/);
assert.match(html, /relationships-panel/);
assert.match(html, /Filha de/);
assert.match(html, /Mãe de/);
assert.match(html, /function applyTheme\(theme\)/);

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'dbviewr.html deve conter script embutido');

const script = scriptMatch[1];
assert.ok(script.includes('table.status !== \'REMOVED\''), 'deve ignorar tabelas removidas');
assert.ok(script.includes('Link'), 'deve permitir copiar link/ancora da tabela');
assert.ok(script.includes('localStorage.setItem(\'dbviewr-theme\''), 'deve persistir preferencia de tema');
assert.ok(!html.includes('data-filter="missing"'), 'viewer final nao deve expor filtros de pendencia');
assert.ok(!html.includes('A revisar'), 'viewer final nao deve expor status de revisao');
assert.ok(!html.includes('Aprovado'), 'viewer final nao deve expor status de aprovacao');

console.log('dbviewr.test.js: ok');
