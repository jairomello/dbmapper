const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('dbviewr.html', 'utf8');
const script = fs.readFileSync('dbviewr.js', 'utf8');
const css = fs.readFileSync('dbviewr.css', 'utf8');

assert.match(html, /<title>DBViewr - Dicionário de Dados<\/title>/);
assert.match(html, /id="json-input"/);
assert.match(html, /id="search-input"/);
assert.match(html, /id="table-nav"/);
assert.match(html, /id="content"/);
assert.match(html, /id="theme-toggle"/);
assert.match(css, /body\.theme-dark/);
assert.match(html, /<script src="dbviewr\.js"><\/script>/);
assert.match(html, /<link rel="stylesheet" href="dbviewr\.css">/);
assert.match(script, /function normalizeProject\(json\)/);
assert.match(script, /function computeStats\(db\)/);
assert.match(script, /function renderTable\(table\)/);
assert.match(script, /function renderRelationships\(table\)/);
assert.match(script, /relationships-panel/);
assert.match(script, /Filha de/);
assert.match(script, /Mãe de/);
assert.match(script, /function applyTheme\(theme\)/);

assert.ok(script.includes('table.status !== \'REMOVED\''), 'deve ignorar tabelas removidas');
assert.ok(script.includes('Link'), 'deve permitir copiar link/ancora da tabela');
assert.ok(script.includes('localStorage.setItem(\'dbviewr-theme\''), 'deve persistir preferencia de tema');
assert.ok(!html.includes('data-filter="missing"'), 'viewer final nao deve expor filtros de pendencia');
assert.ok(!html.includes('A revisar'), 'viewer final nao deve expor status de revisao');
assert.ok(!html.includes('Aprovado'), 'viewer final nao deve expor status de aprovacao');
assert.ok(!html.includes('<script>'), 'dbviewr.html nao deve conter script embutido');
assert.ok(!html.includes('<style>'), 'dbviewr.html nao deve conter bloco <style> embutido');

// Column sorting: PK first, then alphabetical
assert.match(script, /function sortColumns\(columns\)/, 'deve existir helper sortColumns');
assert.match(script, /column\.primary_key/, 'sortColumns deve identificar colunas PK');
assert.match(script, /localeCompare/, 'sortColumns deve ordenar alfabeticamente');

console.log('dbviewr.test.js: ok');
