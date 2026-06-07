    const state = {
        database: null,
        query: ''
    };

    const els = {
        input: document.getElementById('json-input'),
        openBtn: document.getElementById('open-json-btn'),
        heroOpenBtn: document.getElementById('hero-open-json-btn'),
        clearBtn: document.getElementById('clear-btn'),
        themeToggle: document.getElementById('theme-toggle'),
        themeIcon: document.getElementById('theme-icon'),
        searchWrap: document.getElementById('search-wrap'),
        searchInput: document.getElementById('search-input'),
        heroTitle: document.getElementById('hero-title'),
        heroCopy: document.getElementById('hero-copy'),
        statsGrid: document.getElementById('stats-grid'),
        tableNav: document.getElementById('table-nav'),
        content: document.getElementById('content'),
        emptyState: document.getElementById('empty-state'),
        toTop: document.getElementById('to-top')
    };

    function normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function slugify(value) {
        return normalizeText(value)
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'tabela';
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function normalizeRelationship(relationship) {
        return {
            table: relationship.table || '',
            local_columns: [...(relationship.local_columns || [])],
            referenced_columns: [...(relationship.referenced_columns || [])],
            constraint_name: relationship.constraint_name || ''
        };
    }

    function relationshipKey(relationship) {
        return [
            relationship.table,
            (relationship.local_columns || []).join(','),
            (relationship.referenced_columns || []).join(',')
        ].join('|');
    }

    function dedupeRelationships(relationships) {
        const seen = new Set();
        return (relationships || []).filter(relationship => {
            const key = relationshipKey(relationship);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function normalizeRelationships(tables) {
        const tableMap = new Map((tables || []).map(table => [table.name, table]));

        (tables || []).forEach(table => {
            table.relationships = table.relationships || { parents: [], children: [] };
            table.relationships.parents = dedupeRelationships((table.relationships.parents || []).map(normalizeRelationship));
            table.relationships.children = [];
            table.columns.forEach(column => {
                column.primary_key = column.primary_key ?? false;
                column.foreign_key = column.foreign_key ?? false;
            });
        });

        (tables || []).forEach(childTable => {
            childTable.relationships.parents.forEach(parentRelationship => {
                const parentTable = tableMap.get(parentRelationship.table);
                if (!parentTable) return;

                parentRelationship.local_columns.forEach(columnName => {
                    const column = childTable.columns.find(candidate => candidate.name === columnName);
                    if (column) column.foreign_key = true;
                });

                parentTable.relationships.children.push(normalizeRelationship({
                    table: childTable.name,
                    local_columns: parentRelationship.referenced_columns,
                    referenced_columns: parentRelationship.local_columns,
                    constraint_name: parentRelationship.constraint_name
                }));
            });
        });

        tables.forEach(table => {
            table.relationships.children = dedupeRelationships(table.relationships.children);
        });

        return tables;
    }

    function normalizeProject(json) {
        if (!json || !json.database) {
            throw new Error('Formato de JSON inválido.');
        }

        const db = json.database;
        const tables = normalizeRelationships((db.tables || [])
            .filter(table => table.status !== 'REMOVED')
            .map(table => ({
                name: table.name || 'tabela_sem_nome',
                description: table.description || '',
                business_terms: table.business_terms || [],
                relationships: {
                    parents: ((table.relationships && table.relationships.parents) || []).map(normalizeRelationship),
                    children: ((table.relationships && table.relationships.children) || []).map(normalizeRelationship)
                },
                columns: (table.columns || []).map(column => ({
                    name: column.name || 'campo_sem_nome',
                    type: column.type || '',
                    primary_key: column.primary_key ?? false,
                    foreign_key: column.foreign_key ?? false,
                    description: column.description || '',
                    business_terms: column.business_terms || []
                }))
            })));

        return {
            name: db.name || 'Banco de Dados',
            description: db.description || '',
            business_terms: db.business_terms || [],
            tables
        };
    }

    function computeStats(db) {
        const totalTables = db.tables.length;
        const totalColumns = db.tables.reduce((sum, table) => sum + table.columns.length, 0);
        const totalRelationships = db.tables.reduce((sum, table) => sum + ((table.relationships && table.relationships.parents) || []).length, 0);
        const businessTerms = new Set();
        db.business_terms.forEach(term => businessTerms.add(term));
        db.tables.forEach(table => {
            table.business_terms.forEach(term => businessTerms.add(term));
            table.columns.forEach(column => column.business_terms.forEach(term => businessTerms.add(term)));
        });

        return {
            totalTables,
            totalColumns,
            totalRelationships,
            businessTerms: businessTerms.size
        };
    }

    function tableSearchText(table) {
        return normalizeText([
            table.name,
            table.description,
            table.business_terms.join(' '),
            ...((table.relationships && table.relationships.parents) || []).map(relationship => relationship.table),
            ...((table.relationships && table.relationships.children) || []).map(relationship => relationship.table),
            ...table.columns.flatMap(column => [
                column.name,
                column.type,
                column.description,
                column.business_terms.join(' ')
            ])
        ].join(' '));
    }

    function columnMatches(column) {
        if (!state.query) return true;
        return normalizeText([
            column.name,
            column.type,
            column.description,
            column.business_terms.join(' ')
        ].join(' ')).includes(state.query);
    }

    function tableMatches(table) {
        return !state.query || tableSearchText(table).includes(state.query);
    }

    function renderStats(db) {
        const stats = computeStats(db);
        const items = [
            ['Tabelas', stats.totalTables],
            ['Campos', stats.totalColumns],
            ['FKs', stats.totalRelationships],
            ['Termos', stats.businessTerms]
        ];

        els.statsGrid.innerHTML = items.map(([label, value]) => `
            <article class="stat-card">
                <span>${label}</span>
                <strong>${value}</strong>
            </article>
        `).join('');
    }

    function renderTags(tags) {
        if (!tags || tags.length === 0) return '';
        return `
            <div class="term-list">
                ${tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
        `;
    }

    function renderDescription(item) {
        return `<p class="description">${escapeHtml(item.description || 'Sem descrição cadastrada.')}</p>`;
    }

    function renderRelationshipGroup(title, icon, relationships, mode) {
        const items = relationships.length > 0
            ? relationships.map(relationship => {
                const columns = mode === 'parent'
                    ? `${relationship.local_columns.join(', ')} → ${relationship.referenced_columns.join(', ')}`
                    : `${relationship.local_columns.join(', ')} ← ${relationship.referenced_columns.join(', ')}`;
                return `
                    <li class="relationship-item">
                        <a href="#${slugify(relationship.table)}" data-table-link="${escapeHtml(relationship.table)}">${escapeHtml(relationship.table)}</a>
                        <span class="relationship-columns">${escapeHtml(columns)}</span>
                    </li>
                `;
            }).join('')
            : '<li class="relationship-empty">Nenhum relacionamento identificado.</li>';

        return `
            <div class="relationship-group">
                <div class="relationship-title">
                    <i class="material-icons">${icon}</i>
                    <span>${title}</span>
                </div>
                <ul class="relationship-list">${items}</ul>
            </div>
        `;
    }

    function renderRelationships(table) {
        const relationships = table.relationships || { parents: [], children: [] };
        const parentCount = (relationships.parents || []).length;
        const childCount = (relationships.children || []).length;
        const totalCount = parentCount + childCount;
        return `
            <details class="relationships-accordion">
                <summary>
                    <i class="material-icons">chevron_right</i>
                    <span>Relacionamentos</span>
                    <span class="relationships-summary-count">${totalCount} vínculo${totalCount === 1 ? '' : 's'}</span>
                </summary>
                <div class="relationships-panel">
                    ${renderRelationshipGroup('Filha de', 'call_received', relationships.parents || [], 'parent')}
                    ${renderRelationshipGroup('Mãe de', 'call_made', relationships.children || [], 'child')}
                </div>
            </details>
        `;
    }

    function sortColumns(columns) {
        const pkColumns = [];
        const nonPkColumns = [];

        columns.forEach(column => {
            if (column.primary_key) {
                pkColumns.push(column);
            } else {
                nonPkColumns.push(column);
            }
        });

        nonPkColumns.sort((a, b) => {
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

        return [...pkColumns, ...nonPkColumns];
    }

    function renderKeyPills(column) {
        return [
            column.primary_key ? '<span class="key-pill">PK</span>' : '',
            column.foreign_key ? '<span class="key-pill">FK</span>' : ''
        ].join('');
    }

    function renderNav(db) {
        els.tableNav.innerHTML = db.tables
            .filter(tableMatches)
            .map(table => {
                return `
                    <a href="#${slugify(table.name)}" data-table-link="${escapeHtml(table.name)}">
                        <span class="nav-name">${escapeHtml(table.name)}</span>
                        <span class="nav-count">${table.columns.length}</span>
                    </a>
                `;
            }).join('');
    }

    function renderTable(table) {
        const visibleColumns = table.columns.filter(column => columnMatches(column) || !state.query);

        const columns = sortColumns(visibleColumns.length > 0 ? visibleColumns : table.columns);
        return `
            <article class="table-card" id="${slugify(table.name)}" data-table="${escapeHtml(table.name)}">
                <header class="table-head">
                    <div>
                        <div class="table-title-row">
                            <h2>${escapeHtml(table.name)}</h2>
                            <button class="copy-link" type="button" data-copy-link="${slugify(table.name)}">
                                <i class="material-icons">link</i>
                                Link
                            </button>
                        </div>
                    </div>
                    <div class="table-meta">
                        <span class="type-pill">${table.columns.length} campos</span>
                        ${renderTags(table.business_terms)}
                    </div>
                    ${renderDescription(table).replace('class="description"', 'class="description table-description"')}
                    ${renderRelationships(table)}
                </header>
                <table class="columns-table">
                    <thead>
                        <tr>
                            <th>Campo</th>
                            <th>Tipo</th>
                            <th>Descrição</th>
                            <th>Termos</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${columns.map(column => {
                            return `
                                <tr>
                                    <td><span class="column-name">${escapeHtml(column.name)}</span>${renderKeyPills(column)}</td>
                                    <td><span class="type-pill">${escapeHtml(column.type || '-')}</span></td>
                                    <td>${renderDescription(column)}</td>
                                    <td>${renderTags(column.business_terms) || '<span class="description">-</span>'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </article>
        `;
    }

    function renderContent(db) {
        const visibleTables = db.tables.filter(tableMatches);
        els.content.innerHTML = visibleTables.map(renderTable).join('');
        els.emptyState.classList.toggle('is-visible', visibleTables.length === 0);
        bindCopyLinks();
    }

    function render() {
        if (!state.database) return;

        const db = state.database;
        document.body.classList.add('has-data');
        els.searchWrap.hidden = false;
        els.clearBtn.hidden = false;
        els.heroTitle.textContent = db.name;
        els.heroCopy.textContent = db.description || 'Dicionário de dados gerado a partir do projeto DBMapper.';
        renderStats(db);
        renderNav(db);
        renderContent(db);
    }

    function bindCopyLinks() {
        document.querySelectorAll('[data-copy-link]').forEach(button => {
            button.addEventListener('click', async () => {
                const hash = `#${button.dataset.copyLink}`;
                const url = `${location.origin}${location.pathname}${hash}`;
                try {
                    await navigator.clipboard.writeText(url);
                    button.innerHTML = '<i class="material-icons">done</i> Copiado';
                    setTimeout(() => {
                        button.innerHTML = '<i class="material-icons">link</i> Link';
                    }, 1400);
                } catch (err) {
                    location.hash = hash;
                }
            });
        });
    }

    function applyTheme(theme) {
        const useDark = theme === 'dark';
        document.body.classList.toggle('theme-dark', useDark);
        els.themeIcon.textContent = useDark ? 'light_mode' : 'dark_mode';
        els.themeToggle.title = useDark ? 'Usar modo claro' : 'Usar modo escuro';
        localStorage.setItem('dbviewr-theme', useDark ? 'dark' : 'light');
    }

    async function loadFile(file) {
        const text = await file.text();
        const json = JSON.parse(text);
        state.database = normalizeProject(json);
        state.query = '';
        els.searchInput.value = '';
        render();
    }

    els.openBtn.addEventListener('click', () => els.input.click());
    els.heroOpenBtn.addEventListener('click', () => els.input.click());
    els.input.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        try {
            await loadFile(file);
        } catch (err) {
            alert('Não foi possível abrir este JSON do DBMapper.');
            console.error(err);
        }
    });

    els.searchInput.addEventListener('input', event => {
        state.query = normalizeText(event.target.value.trim());
        render();
    });

    els.clearBtn.addEventListener('click', () => {
        state.query = '';
        els.searchInput.value = '';
        render();
    });

    els.themeToggle.addEventListener('click', () => {
        applyTheme(document.body.classList.contains('theme-dark') ? 'light' : 'dark');
    });

    els.toTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.addEventListener('click', event => {
        const link = event.target.closest('[data-table-link]');
        if (!link) return;
        document.querySelectorAll('[data-table-link]').forEach(item => {
            item.classList.toggle('is-active', item === link);
        });
    });

    applyTheme(localStorage.getItem('dbviewr-theme') || 'light');

