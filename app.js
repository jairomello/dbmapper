// ── Global State ──────────────────────────────────────────────────────────────

let projectData = {
    database: {
        name: "Novo Banco",
        description: "",
        business_terms: [],
        reviewed: false,
        tables: []
    }
};

// { type: 'database' | 'table' | 'column', tableIndex?: number, columnIndex?: number }
let currentSelectedItem = null;

// Collapse state (in-memory only, not persisted to JSON)
// collapseState[tableIndex] = true means collapsed
let collapseState = {};

let hasLoadedProject = false;
let updateWizardState = null;
let editorDescriptionSnapshot = '';
let currentProjectBaseName = null;
let sqlDatabaseName = null;

// ── Initialize ────────────────────────────────────────────────────────────────

if (typeof document !== 'undefined') {
document.addEventListener('DOMContentLoaded', function () {
    M.AutoInit();

    const chipsElem = document.querySelector('.chips');
    M.Chips.init(chipsElem, {
        placeholder: 'Adicionar termo',
        secondaryPlaceholder: '+Termo',
    });

    setupEventListeners();
    updateUpdateModelButton();
});
}

function setupEventListeners() {
    document.getElementById('btn-import-sql').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('input-sql').click();
    });

    const importCta = document.getElementById('btn-import-sql-cta');
    if (importCta) {
        importCta.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('input-sql').click();
        });
    }

    document.getElementById('btn-save-project').addEventListener('click', (e) => {
        e.preventDefault();
        openSavePrompt();
    });

    document.getElementById('save-prompt-confirm').addEventListener('click', confirmSavePrompt);
    document.getElementById('save-prompt-cancel').addEventListener('click', closeSavePrompt);
    document.getElementById('save-prompt-close').addEventListener('click', closeSavePrompt);
    document.querySelector('#save-prompt-modal .update-modal-backdrop').addEventListener('click', closeSavePrompt);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('save-prompt-modal').classList.contains('is-open')) {
            closeSavePrompt();
        }
    });

    document.getElementById('btn-load-project').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('input-json').click();
    });

    document.getElementById('btn-update-model').addEventListener('click', (e) => {
        e.preventDefault();
        openUpdateWizard();
    });

    document.getElementById('input-sql').addEventListener('change', handleSQLUpload);
    document.getElementById('input-json').addEventListener('change', handleJSONUpload);
    document.getElementById('input-update-sql').addEventListener('change', handleUpdateSQLUpload);
    document.getElementById('btn-save-item').addEventListener('click', saveCurrentItemChanges);
    document.getElementById('btn-review-item').addEventListener('click', toggleCurrentItemReview);
    document.getElementById('item-description').addEventListener('input', updateEditorReviewAction);
    document.getElementById('update-modal-close').addEventListener('click', closeUpdateWizard);
    document.getElementById('update-modal-cancel').addEventListener('click', closeUpdateWizard);
    document.getElementById('update-modal-back').addEventListener('click', goBackUpdateWizard);
    document.getElementById('update-modal-next').addEventListener('click', goNextUpdateWizard);
}

// ── SQL Parsing ───────────────────────────────────────────────────────────────

async function handleSQLUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const sql = e.target.result;
        try {
            projectData.database.tables = parseSQLToTables(sql);
            hasLoadedProject = false;
            currentProjectBaseName = null;
            updateUpdateModelButton();
            collapseState = {};
            renderTreeView();
            showEditor(false);
            M.toast({ html: 'SQL importado com sucesso!' });
            document.getElementById('welcome-screen').style.display = 'none';
        } catch (err) {
            console.error(err);
            M.toast({ html: 'Erro ao processar SQL. Verifique o console.' });
        }
    };
    reader.readAsText(file);
}

function parseSQLToTables(sql) {
    const newTables = [];
    let capturedDbName = null;

    let cleanSql = sql.replace(/--.*$/gm, '');
    cleanSql = cleanSql.replace(/\/\*[\s\S]*?\*\//g, '');

    const dbRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:DATABASE|SCHEMA)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`\w]+\.)?["`]?([\w]+)["`]?/gi;
    let dbMatch;
    while ((dbMatch = dbRegex.exec(cleanSql)) !== null) {
        capturedDbName = dbMatch[1];
    }
    sqlDatabaseName = capturedDbName;

    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`\w]+\.)?["`]?([\w]+)["`]?\s*\(([\s\S]*?)\)(?:\s*;|\s+ENGINE|\s+$)/gi;

    let match;
    while ((match = tableRegex.exec(cleanSql)) !== null) {
        const tableName = match[1];
        const columnsContent = match[2];

        const tableObj = {
            name: tableName,
            description: "",
            business_terms: [],
            reviewed: false,
            columns: [],
            status: 'NEW'
        };

        const columnLines = splitSqlDefinitions(columnsContent);
        const pendingPrimaryColumns = [];

        columnLines.forEach(line => {
            const upperLine = line.toUpperCase().trim();
            const constraintName = extractConstraintName(line);

            if (upperLine.startsWith('PRIMARY KEY') || (upperLine.startsWith('CONSTRAINT') && upperLine.includes(' PRIMARY KEY'))) {
                pendingPrimaryColumns.push(...parseColumnListFromConstraint(line));
                return;
            }

            if (upperLine.startsWith('FOREIGN KEY') || (upperLine.startsWith('CONSTRAINT') && upperLine.includes(' FOREIGN KEY'))) {
                const relationship = parseForeignKeyConstraint(line, constraintName);
                if (relationship) addParentRelationship(tableObj, relationship);
                return;
            }

            if (
                upperLine.startsWith('CONSTRAINT') ||
                upperLine.startsWith('UNIQUE') ||
                upperLine.startsWith('CHECK') ||
                upperLine.startsWith('KEY ')
            ) {
                return;
            }

            const colMatch = line.match(/["`]?([\w]+)["`]?\s+([^\s,()]+(?:\([^)]*\))?)/i);
            if (colMatch) {
                const column = {
                    name: colMatch[1],
                    type: colMatch[2].toLowerCase(),
                    primary_key: /\bPRIMARY\s+KEY\b/i.test(line),
                    foreign_key: /\bREFERENCES\b/i.test(line),
                    description: "",
                    business_terms: [],
                    reviewed: false,
                    status: 'NEW'
                };
                tableObj.columns.push(column);

                const inlineRelationship = parseInlineForeignKey(line, column.name);
                if (inlineRelationship) addParentRelationship(tableObj, inlineRelationship);
            }
        });

        pendingPrimaryColumns.forEach(columnName => markColumnAsPrimaryKey(tableObj, columnName));

        if (tableObj.columns.length > 0) {
            tableObj.relationships = tableObj.relationships || { parents: [], children: [] };
            newTables.push(tableObj);
        }
    }

    if (newTables.length === 0) {
        throw new Error("Nenhuma tabela encontrada. Verifique se o arquivo contém comandos 'CREATE TABLE' válidos.");
    }

    parseAlterTableForeignKeys(cleanSql, newTables);
    normalizeRelationships(newTables);
    return newTables;
}

function splitSqlDefinitions(content) {
    const definitions = [];
    let currentLine = "";
    let parenDepth = 0;
    let quoteChar = "";

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];

        if (quoteChar) {
            currentLine += char;
            if (char === quoteChar && nextChar !== quoteChar) quoteChar = "";
            if (char === quoteChar && nextChar === quoteChar) {
                currentLine += nextChar;
                i++;
            }
            continue;
        }

        if (char === '"' || char === "'" || char === '`') {
            quoteChar = char;
            currentLine += char;
            continue;
        }

        if (char === '(') parenDepth++;
        if (char === ')') parenDepth--;

        if (char === ',' && parenDepth === 0) {
            definitions.push(currentLine.trim());
            currentLine = "";
        } else {
            currentLine += char;
        }
    }

    if (currentLine.trim()) definitions.push(currentLine.trim());
    return definitions;
}

function cleanIdentifier(value) {
    return String(value || '')
        .trim()
        .replace(/^[`"\[]|[`"\]]$/g, '');
}

function cleanTableIdentifier(value) {
    return String(value || '')
        .split('.')
        .map(part => cleanIdentifier(part))
        .filter(Boolean)
        .pop() || '';
}

function parseColumnList(value) {
    return splitSqlDefinitions(value)
        .map(name => cleanIdentifier(name))
        .filter(Boolean);
}

function parseColumnListFromConstraint(line) {
    const match = line.match(/\(([^)]+)\)/);
    return match ? parseColumnList(match[1]) : [];
}

function extractConstraintName(line) {
    const match = line.match(/^\s*CONSTRAINT\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)/i);
    return match ? cleanIdentifier(match[1]) : "";
}

function parseReferenceTarget(line) {
    const identifier = '(?:"[^"]+"|`[^`]+`|\\[[^\\]]+\\]|\\w+)';
    const pattern = new RegExp(`\\bREFERENCES\\s+(${identifier}(?:\\s*\\.\\s*${identifier})?)\\s*\\(([^)]+)\\)`, 'i');
    const match = line.match(pattern);
    if (!match) return null;

    return {
        table: cleanTableIdentifier(match[1].replace(/\s*\.\s*/g, '.')),
        columns: parseColumnList(match[2])
    };
}

function parseForeignKeyConstraint(line, constraintName = "") {
    const localMatch = line.match(/\bFOREIGN\s+KEY\s*\(([^)]+)\)/i);
    const target = parseReferenceTarget(line);
    if (!localMatch || !target) return null;

    return {
        table: target.table,
        local_columns: parseColumnList(localMatch[1]),
        referenced_columns: target.columns,
        constraint_name: constraintName
    };
}

function parseInlineForeignKey(line, columnName) {
    const target = parseReferenceTarget(line);
    if (!target) return null;

    return {
        table: target.table,
        local_columns: [columnName],
        referenced_columns: target.columns,
        constraint_name: ""
    };
}

function parseAlterTableForeignKeys(sql, tables) {
    const tableMap = new Map((tables || []).map(table => [table.name, table]));
    const identifier = '(?:"[^"]+"|`[^`]+`|\\[[^\\]]+\\]|\\w+)';
    const alterRegex = new RegExp(
        `\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${identifier}(?:\\s*\\.\\s*${identifier})?)\\s+ADD\\s+(?:CONSTRAINT\\s+(${identifier})\\s+)?FOREIGN\\s+KEY\\s*\\(([^)]+)\\)\\s+REFERENCES\\s+(${identifier}(?:\\s*\\.\\s*${identifier})?)\\s*\\(([^)]+)\\)`,
        'gi'
    );

    let match;
    while ((match = alterRegex.exec(sql)) !== null) {
        const tableName = cleanTableIdentifier(match[1].replace(/\s*\.\s*/g, '.'));
        const table = tableMap.get(tableName);
        if (!table) continue;

        addParentRelationship(table, {
            table: cleanTableIdentifier(match[4].replace(/\s*\.\s*/g, '.')),
            local_columns: parseColumnList(match[3]),
            referenced_columns: parseColumnList(match[5]),
            constraint_name: cleanIdentifier(match[2] || "")
        });
    }
}

function markColumnAsPrimaryKey(table, columnName) {
    const column = (table.columns || []).find(col => col.name === columnName);
    if (column) column.primary_key = true;
}

function markColumnAsForeignKey(table, columnName) {
    const column = (table.columns || []).find(col => col.name === columnName);
    if (column) column.foreign_key = true;
}

function addParentRelationship(table, relationship) {
    table.relationships = table.relationships || { parents: [], children: [] };
    relationship.local_columns.forEach(columnName => markColumnAsForeignKey(table, columnName));
    table.relationships.parents.push(normalizeRelationship(relationship));
}

function normalizeRelationship(relationship) {
    return {
        table: relationship.table || "",
        local_columns: [...(relationship.local_columns || [])],
        referenced_columns: [...(relationship.referenced_columns || [])],
        constraint_name: relationship.constraint_name || "",
        description: relationship.description || "",
        reviewed: relationship.reviewed ?? false
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
        (table.columns || []).forEach(column => {
            column.primary_key = column.primary_key ?? false;
            column.foreign_key = column.foreign_key ?? false;
        });
        table.relationships.parents.forEach(relationship => {
            relationship.local_columns.forEach(columnName => markColumnAsForeignKey(table, columnName));
        });
    });

    (tables || []).forEach(childTable => {
        (childTable.relationships.parents || []).forEach(parentRelationship => {
            const parentTable = tableMap.get(parentRelationship.table);
            if (!parentTable) return;

            parentTable.relationships.children.push(normalizeRelationship({
                table: childTable.name,
                local_columns: parentRelationship.referenced_columns,
                referenced_columns: parentRelationship.local_columns,
                constraint_name: parentRelationship.constraint_name
            }));
        });
    });

    (tables || []).forEach(table => {
        table.relationships.parents = dedupeRelationships(table.relationships.parents);
        table.relationships.children = dedupeRelationships(table.relationships.children);
    });

    return tables;
}

function parseSQL(sql) {
    mergeSchemas(parseSQLToTables(sql));
}

function mergeSchemas(newTables) {
    const existingTables = projectData.database.tables;
    const mergedTables = [];

    newTables.forEach(newTable => {
        const oldTable = existingTables.find(t => t.name === newTable.name);

        if (oldTable) {
            const mergedColumns = newTable.columns.map(newCol => {
                const oldCol = oldTable.columns.find(c => c.name === newCol.name);
                if (oldCol) {
                    return {
                        ...newCol,
                        description: oldCol.description,
                        business_terms: oldCol.business_terms,
                        reviewed: oldCol.reviewed ?? false,
                        status: 'UNCHANGED'
                    };
                }
                return { ...newCol, reviewed: false, status: 'NEW' };
            });

            mergedTables.push({
                ...newTable,
                columns: mergedColumns,
                description: oldTable.description,
                business_terms: oldTable.business_terms,
                reviewed: oldTable.reviewed ?? false,
                status: 'UNCHANGED'
            });
        } else {
            newTable.status = 'NEW';
            newTable.reviewed = false;
            newTable.columns.forEach(c => {
                c.status = 'NEW';
                c.reviewed = false;
            });
            mergedTables.push(newTable);
        }
    });

    existingTables.forEach(oldTable => {
        if (!newTables.find(t => t.name === oldTable.name)) {
            mergedTables.push({ ...oldTable, status: 'REMOVED' });
        }
    });

    projectData.database.tables = normalizeRelationships(mergedTables);
}

function cloneColumn(column, overrides = {}) {
    return {
        name: column.name,
        type: column.type,
        primary_key: column.primary_key ?? false,
        foreign_key: column.foreign_key ?? false,
        description: column.description || "",
        business_terms: [...(column.business_terms || [])],
        reviewed: column.reviewed ?? false,
        status: column.status || 'UNCHANGED',
        ...overrides
    };
}

function cloneTable(table, overrides = {}) {
    return {
        name: table.name,
        description: table.description || "",
        business_terms: [...(table.business_terms || [])],
        reviewed: table.reviewed ?? false,
        columns: (table.columns || []).map(col => cloneColumn(col)),
        relationships: {
            parents: ((table.relationships && table.relationships.parents) || []).map(normalizeRelationship),
            children: ((table.relationships && table.relationships.children) || []).map(normalizeRelationship)
        },
        status: table.status || 'UNCHANGED',
        ...overrides
    };
}

function createUpdateWizardState(currentDatabase, newTables) {
    const oldTables = normalizeRelationships((currentDatabase.tables || [])
        .filter(table => table.status !== 'REMOVED')
        .map(table => cloneTable(table)));
    const importedTables = normalizeRelationships(newTables.map(table => cloneTable(table)));
    const tableRows = buildTableRows(oldTables, importedTables);

    return {
        step: 'upload',
        oldTables,
        newTables: importedTables,
        tableRows,
        columnGroups: [],
        relationshipGroups: []
    };
}

function buildTableRows(oldTables, newTables) {
    const matchedNewNames = new Set();
    const rows = [];

    oldTables.forEach(oldTable => {
        const newTable = newTables.find(table => table.name === oldTable.name);
        if (newTable) {
            matchedNewNames.add(newTable.name);
            rows.push({
                id: `table:${oldTable.name}`,
                kind: 'same',
                oldName: oldTable.name,
                newName: newTable.name,
                action: 'keep',
                renameTo: ''
            });
        } else {
            rows.push({
                id: `table-old:${oldTable.name}`,
                kind: 'oldOnly',
                oldName: oldTable.name,
                newName: '',
                action: 'delete',
                renameTo: ''
            });
        }
    });

    newTables.forEach(newTable => {
        if (!matchedNewNames.has(newTable.name)) {
            rows.push({
                id: `table-new:${newTable.name}`,
                kind: 'newOnly',
                oldName: '',
                newName: newTable.name,
                action: 'add',
                disabledBy: ''
            });
        }
    });

    return rows;
}

function getUsedTableRenameTargets(tableRows) {
    return new Set(tableRows
        .filter(row => row.kind === 'oldOnly' && row.action === 'rename' && row.renameTo)
        .map(row => row.renameTo));
}

function buildTablePlans(state) {
    const usedRenameTargets = getUsedTableRenameTargets(state.tableRows);
    const plans = [];

    state.tableRows.forEach(row => {
        if (row.kind === 'same') {
            plans.push({
                kind: 'matched',
                oldName: row.oldName,
                newName: row.newName
            });
            return;
        }

        if (row.kind === 'oldOnly') {
            if (row.action === 'rename' && row.renameTo) {
                plans.push({
                    kind: 'renamed',
                    oldName: row.oldName,
                    newName: row.renameTo
                });
            } else {
                plans.push({
                    kind: 'delete',
                    oldName: row.oldName,
                    newName: ''
                });
            }
            return;
        }

        if (row.kind === 'newOnly' && !usedRenameTargets.has(row.newName)) {
            plans.push({
                kind: 'add',
                oldName: '',
                newName: row.newName
            });
        }
    });

    return plans;
}

function buildColumnGroups(state) {
    return buildTablePlans(state).map(plan => {
        const oldTable = state.oldTables.find(table => table.name === plan.oldName);
        const newTable = state.newTables.find(table => table.name === plan.newName);
        const rows = buildColumnRows(oldTable, newTable, plan);

        return {
            tableKind: plan.kind,
            oldTableName: plan.oldName,
            newTableName: plan.newName,
            rows
        };
    });
}

function buildColumnRows(oldTable, newTable, tablePlan) {
    if (tablePlan.kind === 'add') {
        return (newTable.columns || []).map(col => ({
            id: `col-new:${newTable.name}:${col.name}`,
            kind: 'newOnly',
            oldName: '',
            newName: col.name,
            oldType: '',
            newType: col.type,
            action: 'add',
            renameTo: '',
            disabledBy: ''
        }));
    }

    if (tablePlan.kind === 'delete') {
        return (oldTable.columns || []).map(col => ({
            id: `col-old:${oldTable.name}:${col.name}`,
            kind: 'oldOnly',
            oldName: col.name,
            newName: '',
            oldType: col.type,
            newType: '',
            action: 'delete',
            renameTo: ''
        }));
    }

    const matchedNewNames = new Set();
    const rows = [];

    oldTable.columns.forEach(oldCol => {
        const newCol = newTable.columns.find(col => col.name === oldCol.name);
        if (newCol) {
            matchedNewNames.add(newCol.name);
            rows.push({
                id: `col:${oldTable.name}:${oldCol.name}`,
                kind: oldCol.type === newCol.type ? 'same' : 'changed',
                oldName: oldCol.name,
                newName: newCol.name,
                oldType: oldCol.type,
                newType: newCol.type,
                action: 'keep',
                renameTo: ''
            });
        } else {
            rows.push({
                id: `col-old:${oldTable.name}:${oldCol.name}`,
                kind: 'oldOnly',
                oldName: oldCol.name,
                newName: '',
                oldType: oldCol.type,
                newType: '',
                action: 'delete',
                renameTo: ''
            });
        }
    });

    newTable.columns.forEach(newCol => {
        if (!matchedNewNames.has(newCol.name)) {
            rows.push({
                id: `col-new:${newTable.name}:${newCol.name}`,
                kind: 'newOnly',
                oldName: '',
                newName: newCol.name,
                oldType: '',
                newType: newCol.type,
                action: 'add',
                renameTo: '',
                disabledBy: ''
            });
        }
    });

    return rows;
}

function getUsedColumnRenameTargets(group) {
    return new Set(group.rows
        .filter(row => row.kind === 'oldOnly' && row.action === 'rename' && row.renameTo)
        .map(row => row.renameTo));
}

function applyUpdateWizardState(database, state) {
    const resultTables = [];
    const columnGroupsByNewName = new Map(state.columnGroups.map(group => [group.newTableName || group.oldTableName, group]));

    buildTablePlans(state).forEach(plan => {
        const oldTable = state.oldTables.find(table => table.name === plan.oldName);
        const newTable = state.newTables.find(table => table.name === plan.newName);

        if (plan.kind === 'delete') return;

        if (plan.kind === 'add') {
            resultTables.push(cloneTable(newTable, {
                description: "",
                business_terms: [],
                reviewed: false,
                status: 'NEW',
                relationships: {
                    parents: ((newTable.relationships && newTable.relationships.parents) || []).map(normalizeRelationship),
                    children: ((newTable.relationships && newTable.relationships.children) || []).map(normalizeRelationship)
                },
                columns: newTable.columns.map(col => cloneColumn(col, {
                    description: "",
                    business_terms: [],
                    reviewed: false,
                    status: 'NEW'
                }))
            }));
            return;
        }

        const group = columnGroupsByNewName.get(plan.newName);
        const usedRenameTargets = group ? getUsedColumnRenameTargets(group) : new Set();
        const newColumns = [];

        newTable.columns.forEach(newCol => {
            const sameRow = group.rows.find(row => row.newName === newCol.name && (row.kind === 'same' || row.kind === 'changed'));
            const renamedRow = group.rows.find(row => row.kind === 'oldOnly' && row.action === 'rename' && row.renameTo === newCol.name);
            const oldColName = renamedRow ? renamedRow.oldName : (sameRow ? sameRow.oldName : '');
            const oldCol = oldColName ? oldTable.columns.find(col => col.name === oldColName) : null;

            if (oldCol) {
                newColumns.push(cloneColumn(oldCol, {
                    name: newCol.name,
                    type: newCol.type,
                    primary_key: newCol.primary_key ?? false,
                    foreign_key: newCol.foreign_key ?? false,
                    status: sameRow && sameRow.kind === 'changed' ? 'CHANGED' : 'UNCHANGED'
                }));
            } else if (!usedRenameTargets.has(newCol.name)) {
                newColumns.push(cloneColumn(newCol, {
                    description: "",
                    business_terms: [],
                    reviewed: false,
                    status: 'NEW'
                }));
            }
        });

        resultTables.push(cloneTable(oldTable, {
            name: newTable.name,
            columns: newColumns,
            relationships: {
                parents: ((newTable.relationships && newTable.relationships.parents) || []).map(normalizeRelationship),
                children: ((newTable.relationships && newTable.relationships.children) || []).map(normalizeRelationship)
            },
            status: plan.kind === 'renamed' ? 'RENAMED' : 'UNCHANGED'
        }));
    });

    database.tables = normalizeRelationships(resultTables);
    database.reviewed = resultTables.length > 0 && resultTables.every(table => table.reviewed);
    return database;
}

// ── Stats & Status Bar ────────────────────────────────────────────────────────

function computeStats() {
    const db = projectData.database;
    const tables = db.tables.filter(t => t.status !== 'REMOVED');

    const totalTables  = tables.length;
    const totalCols    = tables.reduce((s, t) => s + t.columns.length, 0);

    const hasDescription = item => !!(item.description && item.description.trim() !== '');
    const descTables   = tables.filter(hasDescription).length;
    const descCols     = tables.reduce((s, t) => s + t.columns.filter(hasDescription).length, 0);

    const revTables    = tables.filter(t => hasDescription(t) && t.reviewed).length;
    const revCols      = tables.reduce((s, t) => s + t.columns.filter(c => hasDescription(c) && c.reviewed).length, 0);

    const pendingTotal = (totalTables - revTables) + (totalCols - revCols);

    const reviewable   = totalTables + totalCols;
    const reviewed     = revTables + revCols;
    const pct          = reviewable > 0 ? Math.round((reviewed / reviewable) * 100) : 0;

    const allParents = tables.flatMap(t => t.relationships ? (t.relationships.parents || []) : []);
    const totalFks   = allParents.length;
    const fksDesc    = allParents.filter(hasDescription).length;
    const fksRev     = allParents.filter(r => hasDescription(r) && r.reviewed).length;

    return { totalTables, totalCols, descTables, descCols, revTables, revCols, pendingTotal, pct, dbName: db.name, totalFks, fksDesc, fksRev };
}

function renderStatusBar() {
    const s = computeStats();

    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    set('sb-db-label',    s.dbName);
    set('sb-total-tables', s.totalTables);
    set('sb-total-cols',   s.totalCols);
    set('sb-desc-tables',  `${s.descTables}/${s.totalTables}`);
    set('sb-desc-cols',    `${s.descCols}/${s.totalCols}`);
    set('sb-rev-tables',   `${s.revTables}/${s.totalTables}`);
    set('sb-rev-cols',     `${s.revCols}/${s.totalCols}`);
    set('sb-pending',      s.pendingTotal);
    set('sb-total-fks',    s.totalFks);
    set('sb-fk-desc',      `${s.fksDesc}/${s.totalFks}`);
    set('sb-fk-rev',       `${s.fksRev}/${s.totalFks}`);
    set('sb-progress-pct', `${s.pct}%`);

    // Progress bar fill + color class
    const fill = document.getElementById('sb-progress-fill');
    if (fill) {
        fill.style.width = `${s.pct}%`;
        fill.className = 'sb-progress-fill ' + (
            s.pct < 30 ? 'pct-low' :
            s.pct < 70 ? 'pct-mid' :
            'pct-high'
        );
    }

    // Clicking the db name selects the database node
    const dbBtn = document.getElementById('sb-db-name');
    if (dbBtn) {
        dbBtn.onclick = () => {
            selectItem('database');
            showEditor(true);
        };
    }
}

function updateUpdateModelButton() {
    const btn = document.getElementById('btn-update-model');
    if (!btn) return;
    btn.hidden = !hasLoadedProject;
}

function openUpdateWizard() {
    if (!hasLoadedProject) {
        M.toast({ html: 'Abra um projeto JSON antes de atualizar o modelo.' });
        return;
    }

    updateWizardState = {
        step: 'upload',
        oldTables: [],
        newTables: [],
        tableRows: [],
        columnGroups: [],
        relationshipGroups: []
    };

    document.getElementById('input-update-sql').value = '';
    document.getElementById('update-modal').classList.add('is-open');
    renderUpdateWizard();
}

function closeUpdateWizard() {
    updateWizardState = null;
    document.getElementById('update-modal').classList.remove('is-open');
}

function handleUpdateSQLUpload(event) {
    const file = event.target.files[0];
    if (!file || !updateWizardState) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const newTables = parseSQLToTables(e.target.result);
            updateWizardState = createUpdateWizardState(projectData.database, newTables);
            updateWizardState.step = 'tables';
            renderUpdateWizard();
        } catch (err) {
            console.error(err);
            M.toast({ html: 'Erro ao processar SQL da nova versão.' });
        }
    };
    reader.readAsText(file);
}

function goBackUpdateWizard() {
    if (!updateWizardState) return;
    if (updateWizardState.step === 'relationships') {
        updateWizardState.step = 'columns';
    } else if (updateWizardState.step === 'columns') {
        updateWizardState.step = 'tables';
    } else if (updateWizardState.step === 'summary') {
        updateWizardState.step = 'relationships';
    }
    renderUpdateWizard();
}

function goNextUpdateWizard() {
    if (!updateWizardState) return;

    if (updateWizardState.step === 'upload') {
        document.getElementById('input-update-sql').click();
        return;
    }

    if (updateWizardState.step === 'tables') {
        updateWizardState.columnGroups = buildColumnGroups(updateWizardState);
        updateWizardState.step = 'columns';
        renderUpdateWizard();
        return;
    }

    if (updateWizardState.step === 'columns') {
        updateWizardState.relationshipGroups = buildRelationshipGroups(updateWizardState);
        updateWizardState.step = 'relationships';
        renderUpdateWizard();
        return;
    }

    if (updateWizardState.step === 'relationships') {
        updateWizardState.step = 'summary';
        renderUpdateWizard();
        return;
    }

    if (updateWizardState.step === 'summary') {
        applyUpdateWizardState(projectData.database, updateWizardState);
        collapseState = {};
        currentSelectedItem = null;
        renderTreeView();
        showEditor(false);
        closeUpdateWizard();
        M.toast({ html: 'Modelo atualizado com sucesso!' });
    }
}

function renderUpdateWizard() {
    if (!updateWizardState) return;

    const title = document.getElementById('update-modal-title');
    const subtitle = document.getElementById('update-modal-subtitle');
    const body = document.getElementById('update-modal-body');
    const back = document.getElementById('update-modal-back');
    const next = document.getElementById('update-modal-next');

    document.querySelectorAll('.wizard-step').forEach(step => {
        step.classList.toggle('is-active', step.dataset.step === updateWizardState.step);
    });

    back.disabled = updateWizardState.step === 'upload' || updateWizardState.step === 'tables';
    next.disabled = false;

    if (updateWizardState.step === 'upload') {
        title.textContent = 'Atualizar Modelo';
        subtitle.textContent = 'Selecione o arquivo SQL da nova versão do banco.';
        next.innerHTML = '<i class="material-icons">upload_file</i> Escolher SQL';
        body.innerHTML = `
            <div class="update-upload-panel">
                <i class="material-icons">schema</i>
                <h3>Importar nova versão do banco</h3>
                <p>O projeto atual será usado como base. Nenhuma alteração será aplicada antes da confirmação final.</p>
                <button class="btn-cta" id="update-sql-picker-inline" type="button">
                    <i class="material-icons">upload_file</i>
                    Procurar arquivo SQL
                </button>
            </div>
        `;
        document.getElementById('update-sql-picker-inline').addEventListener('click', () => {
            document.getElementById('input-update-sql').click();
        });
        return;
    }

    if (updateWizardState.step === 'tables') {
        title.textContent = 'Comparar Tabelas';
        subtitle.textContent = 'Revise tabelas adicionadas, excluídas ou renomeadas antes de comparar campos.';
        next.innerHTML = 'Avançar <i class="material-icons">arrow_forward</i>';
        body.innerHTML = renderTableComparison();
        bindTableComparisonEvents();
        return;
    }

    if (updateWizardState.step === 'columns') {
        title.textContent = 'Comparar Campos';
        subtitle.textContent = 'Revise campos adicionados, excluídos, renomeados ou com tipo alterado.';
        next.innerHTML = 'Comparar relacionamentos <i class="material-icons">arrow_forward</i>';
        body.innerHTML = renderColumnComparison();
        bindColumnComparisonEvents();
        return;
    }

    if (updateWizardState.step === 'relationships') {
        title.textContent = 'Comparar Relacionamentos';
        subtitle.textContent = 'Revise chaves estrangeiras identificadas entre tabelas.';
        next.innerHTML = 'Revisar resumo <i class="material-icons">arrow_forward</i>';
        body.innerHTML = renderRelationshipComparison();
        return;
    }

    title.textContent = 'Confirmar Atualização';
    subtitle.textContent = 'Confira o resumo das alterações antes de aplicar no projeto atual.';
    next.innerHTML = '<i class="material-icons">check</i> Aplicar alterações';
    body.innerHTML = renderUpdateSummary();
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

function renderNameCell(name, type) {
    if (!name) return '<span class="diff-empty">-</span>';
    const escapedName = escapeHtml(name);
    const escapedType = escapeHtml(type);
    return `<span class="diff-name">${escapedName}</span>${type ? `<span class="diff-type">${escapedType}</span>` : ''}`;
}

function renderTableComparison() {
    const usedTargets = getUsedTableRenameTargets(updateWizardState.tableRows);
    const availableTargets = updateWizardState.tableRows
        .filter(row => row.kind === 'newOnly')
        .map(row => row.newName);

    const rows = updateWizardState.tableRows.map((row, idx) => {
        const disabledBy = row.kind === 'newOnly'
            ? updateWizardState.tableRows.find(candidate => candidate.renameTo === row.newName)
            : null;
        const rowClass = [
            'diff-row',
            `is-${row.kind}`,
            disabledBy ? 'is-mapped' : ''
        ].filter(Boolean).join(' ');

        let action = '<span class="diff-action-muted">Sem alteração</span>';
        if (row.kind === 'oldOnly') {
            const options = availableTargets
                .filter(name => !usedTargets.has(name) || name === row.renameTo)
                .map(name => `<option value="${escapeHtml(name)}" ${row.renameTo === name ? 'selected' : ''}>${escapeHtml(name)}</option>`)
                .join('');
            action = `
                <select class="diff-select" data-table-action="${idx}">
                    <option value="delete" ${row.action === 'delete' ? 'selected' : ''}>Excluir do banco atual</option>
                    <option value="rename" ${row.action === 'rename' ? 'selected' : ''}>Tabela mudou de nome</option>
                </select>
                ${row.action === 'rename' ? `
                    <select class="diff-select diff-select-secondary" data-table-rename="${idx}">
                        <option value="">Escolha a tabela nova</option>
                        ${options}
                    </select>
                ` : ''}
            `;
        } else if (row.kind === 'newOnly') {
            action = disabledBy
                ? `<span class="diff-action-muted">Mapeada como novo nome de ${escapeHtml(disabledBy.oldName)}</span>`
                : '<span class="diff-action-add">Adicionar no banco atual</span>';
        }

        return `
            <tr class="${rowClass}">
                <td>${renderNameCell(row.oldName)}</td>
                <td>${renderNameCell(row.newName)}</td>
                <td>${action}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="diff-grid-wrap">
            <table class="diff-grid">
                <thead>
                    <tr>
                        <th>Banco Atual</th>
                        <th>Banco Novo</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function bindTableComparisonEvents() {
    document.querySelectorAll('[data-table-action]').forEach(select => {
        select.addEventListener('change', (event) => {
            const row = updateWizardState.tableRows[Number(event.target.dataset.tableAction)];
            row.action = event.target.value;
            if (row.action === 'delete') row.renameTo = '';
            renderUpdateWizard();
        });
    });

    document.querySelectorAll('[data-table-rename]').forEach(select => {
        select.addEventListener('change', (event) => {
            const row = updateWizardState.tableRows[Number(event.target.dataset.tableRename)];
            row.renameTo = event.target.value;
            renderUpdateWizard();
        });
    });
}

function renderColumnComparison() {
    const groups = updateWizardState.columnGroups.map((group, groupIdx) => {
        const usedTargets = getUsedColumnRenameTargets(group);
        const availableTargets = group.rows.filter(row => row.kind === 'newOnly').map(row => row.newName);
        const rows = group.rows.map((row, rowIdx) => {
            const disabledBy = row.kind === 'newOnly'
                ? group.rows.find(candidate => candidate.renameTo === row.newName)
                : null;
            const rowClass = [
                'diff-row',
                'diff-row-field',
                `is-${row.kind}`,
                disabledBy ? 'is-mapped' : ''
            ].filter(Boolean).join(' ');

            let action = row.kind === 'changed'
                ? '<span class="diff-action-change">Atualizar tipo</span>'
                : '<span class="diff-action-muted">Sem alteração</span>';

            if (row.kind === 'oldOnly') {
                const options = availableTargets
                    .filter(name => !usedTargets.has(name) || name === row.renameTo)
                    .map(name => `<option value="${escapeHtml(name)}" ${row.renameTo === name ? 'selected' : ''}>${escapeHtml(name)}</option>`)
                    .join('');
                action = `
                    <select class="diff-select" data-column-action="${groupIdx}:${rowIdx}">
                        <option value="delete" ${row.action === 'delete' ? 'selected' : ''}>Excluir do banco atual</option>
                        <option value="rename" ${row.action === 'rename' ? 'selected' : ''}>Campo mudou de nome</option>
                    </select>
                    ${row.action === 'rename' ? `
                        <select class="diff-select diff-select-secondary" data-column-rename="${groupIdx}:${rowIdx}">
                            <option value="">Escolha o campo novo</option>
                            ${options}
                        </select>
                    ` : ''}
                `;
            } else if (row.kind === 'newOnly') {
                action = disabledBy
                    ? `<span class="diff-action-muted">Mapeado como novo nome de ${escapeHtml(disabledBy.oldName)}</span>`
                    : '<span class="diff-action-add">Adicionar no banco atual</span>';
            }

            return `
                <tr class="${rowClass}">
                    <td>${renderNameCell(row.oldName, row.oldType)}</td>
                    <td>${renderNameCell(row.newName, row.newType)}</td>
                    <td>${action}</td>
                </tr>
            `;
        }).join('');

        return `
            <section class="diff-table-group">
                <div class="diff-table-title">
                    <span>${renderNameCell(group.oldTableName)}</span>
                    <i class="material-icons">arrow_forward</i>
                    <span>${renderNameCell(group.newTableName)}</span>
                </div>
                <table class="diff-grid">
                    <thead>
                        <tr>
                            <th>Banco Atual</th>
                            <th>Banco Novo</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>
        `;
    }).join('');

    return `<div class="diff-groups">${groups}</div>`;
}

function bindColumnComparisonEvents() {
    document.querySelectorAll('[data-column-action]').forEach(select => {
        select.addEventListener('change', (event) => {
            const [groupIdx, rowIdx] = event.target.dataset.columnAction.split(':').map(Number);
            const row = updateWizardState.columnGroups[groupIdx].rows[rowIdx];
            row.action = event.target.value;
            if (row.action === 'delete') row.renameTo = '';
            renderUpdateWizard();
        });
    });

    document.querySelectorAll('[data-column-rename]').forEach(select => {
        select.addEventListener('change', (event) => {
            const [groupIdx, rowIdx] = event.target.dataset.columnRename.split(':').map(Number);
            updateWizardState.columnGroups[groupIdx].rows[rowIdx].renameTo = event.target.value;
            renderUpdateWizard();
        });
    });
}

function buildTableNameMap(state) {
    const map = new Map();
    buildTablePlans(state).forEach(plan => {
        if (plan.kind !== 'delete' && plan.oldName) {
            map.set(plan.oldName, plan.newName);
        }
    });
    return map;
}

function buildColumnNameMaps(state) {
    const maps = new Map();

    (state.columnGroups || []).forEach(group => {
        if (!group.oldTableName || !group.newTableName) return;

        const columnMap = new Map();
        group.rows.forEach(row => {
            if ((row.kind === 'same' || row.kind === 'changed') && row.oldName && row.newName) {
                columnMap.set(row.oldName, row.newName);
            }
            if (row.kind === 'oldOnly' && row.action === 'rename' && row.renameTo) {
                columnMap.set(row.oldName, row.renameTo);
            }
        });
        maps.set(group.oldTableName, columnMap);
    });

    return maps;
}

function mapColumnNames(columnNames, columnMap) {
    return (columnNames || []).map(columnName => columnMap && columnMap.has(columnName) ? columnMap.get(columnName) : columnName);
}

function mapOldRelationship(relationship, currentOldTableName, tableNameMap, columnNameMaps) {
    const targetOldTableName = relationship.table;
    const currentColumnMap = columnNameMaps.get(currentOldTableName);
    const targetColumnMap = columnNameMaps.get(targetOldTableName);

    return normalizeRelationship({
        table: tableNameMap.get(targetOldTableName) || targetOldTableName,
        local_columns: mapColumnNames(relationship.local_columns, currentColumnMap),
        referenced_columns: mapColumnNames(relationship.referenced_columns, targetColumnMap),
        constraint_name: relationship.constraint_name
    });
}

function relationshipLabel(relationship) {
    return `${relationship.local_columns.join(', ')} → ${relationship.table}.${relationship.referenced_columns.join(', ')}`;
}

function buildRelationshipGroups(state) {
    const tableNameMap = buildTableNameMap(state);
    const columnNameMaps = buildColumnNameMaps(state);

    return buildTablePlans(state)
        .filter(plan => plan.kind !== 'delete')
        .map(plan => {
            const oldTable = state.oldTables.find(table => table.name === plan.oldName);
            const newTable = state.newTables.find(table => table.name === plan.newName);
            const oldRelationships = oldTable
                ? ((oldTable.relationships && oldTable.relationships.parents) || [])
                    .map(relationship => mapOldRelationship(relationship, oldTable.name, tableNameMap, columnNameMaps))
                : [];
            const newRelationships = newTable
                ? ((newTable.relationships && newTable.relationships.parents) || []).map(normalizeRelationship)
                : [];
            const matchedNewKeys = new Set();
            const rows = [];

            oldRelationships.forEach(oldRelationship => {
                const key = relationshipKey(oldRelationship);
                const newRelationship = newRelationships.find(candidate => relationshipKey(candidate) === key);
                if (newRelationship) {
                    matchedNewKeys.add(key);
                    rows.push({
                        kind: 'same',
                        oldRelationship,
                        newRelationship,
                        action: 'keep'
                    });
                } else {
                    rows.push({
                        kind: 'oldOnly',
                        oldRelationship,
                        newRelationship: null,
                        action: 'delete'
                    });
                }
            });

            newRelationships.forEach(newRelationship => {
                const key = relationshipKey(newRelationship);
                if (!matchedNewKeys.has(key)) {
                    rows.push({
                        kind: 'newOnly',
                        oldRelationship: null,
                        newRelationship,
                        action: 'add'
                    });
                }
            });

            return {
                tableName: plan.newName,
                oldTableName: plan.oldName,
                rows
            };
        })
        .filter(group => group.rows.length > 0);
}

function renderRelationshipCell(relationship) {
    if (!relationship) return '<span class="diff-empty">-</span>';
    const constraint = relationship.constraint_name
        ? `<span class="diff-type">${escapeHtml(relationship.constraint_name)}</span>`
        : '';
    return `<span class="diff-name">${escapeHtml(relationshipLabel(relationship))}</span>${constraint}`;
}

function renderRelationshipComparison() {
    if (!updateWizardState.relationshipGroups.length) {
        return `
            <div class="update-upload-panel">
                <i class="material-icons">link_off</i>
                <h3>Nenhuma alteração de relacionamento</h3>
                <p>Não foram encontradas inclusões ou remoções de chaves estrangeiras entre o projeto atual e o novo SQL.</p>
            </div>
        `;
    }

    const groups = updateWizardState.relationshipGroups.map(group => {
        const rows = group.rows.map(row => {
            const action = row.kind === 'newOnly'
                ? '<span class="diff-action-add">Adicionar FK</span>'
                : row.kind === 'oldOnly'
                    ? '<span class="diff-action-change">Remover FK</span>'
                    : '<span class="diff-action-muted">Sem alteração</span>';

            return `
                <tr class="diff-row is-${row.kind}">
                    <td>${renderRelationshipCell(row.oldRelationship)}</td>
                    <td>${renderRelationshipCell(row.newRelationship)}</td>
                    <td>${action}</td>
                </tr>
            `;
        }).join('');

        return `
            <section class="diff-table-group">
                <div class="diff-table-title">
                    <i class="material-icons">account_tree</i>
                    <span>${escapeHtml(group.tableName)}</span>
                </div>
                <table class="diff-grid">
                    <thead>
                        <tr>
                            <th>Projeto Atual</th>
                            <th>SQL Novo</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>
        `;
    }).join('');

    return `<div class="diff-groups">${groups}</div>`;
}

function renderUpdateSummary() {
    const plans = buildTablePlans(updateWizardState);
    const tableAdds = plans.filter(plan => plan.kind === 'add').length;
    const tableDeletes = plans.filter(plan => plan.kind === 'delete').length;
    const tableRenames = plans.filter(plan => plan.kind === 'renamed').length;
    let columnAdds = 0;
    let columnDeletes = 0;
    let columnRenames = 0;
    let columnChanges = 0;
    let relationshipAdds = 0;
    let relationshipDeletes = 0;

    updateWizardState.columnGroups.forEach(group => {
        const usedTargets = getUsedColumnRenameTargets(group);
        group.rows.forEach(row => {
            if (row.kind === 'oldOnly' && row.action === 'delete') columnDeletes++;
            if (row.kind === 'oldOnly' && row.action === 'rename' && row.renameTo) columnRenames++;
            if (row.kind === 'newOnly' && !usedTargets.has(row.newName)) columnAdds++;
            if (row.kind === 'changed') columnChanges++;
        });
    });

    (updateWizardState.relationshipGroups || []).forEach(group => {
        group.rows.forEach(row => {
            if (row.kind === 'newOnly') relationshipAdds++;
            if (row.kind === 'oldOnly') relationshipDeletes++;
        });
    });

    const summaryItems = [
        ['Tabelas adicionadas', tableAdds],
        ['Tabelas excluídas', tableDeletes],
        ['Tabelas renomeadas', tableRenames],
        ['Campos adicionados', columnAdds],
        ['Campos excluídos', columnDeletes],
        ['Campos renomeados', columnRenames],
        ['Tipos de campos atualizados', columnChanges],
        ['FKs adicionadas', relationshipAdds],
        ['FKs removidas', relationshipDeletes]
    ];

    return `
        <div class="update-summary">
            ${summaryItems.map(([label, count]) => `
                <div class="summary-item">
                    <span>${label}</span>
                    <strong>${count}</strong>
                </div>
            `).join('')}
        </div>
        <div class="summary-note">
            Descrições, termos de negócio e marcações de revisão já existentes serão preservados nas tabelas e campos mantidos ou renomeados.
        </div>
    `;
}

// ── UI Rendering ──────────────────────────────────────────────────────────────

function makeTreeItem(classes) {
    const el = document.createElement('div');
    el.className = ['tree-item', ...classes].filter(Boolean).join(' ');
    return el;
}

function makeCheckbox(checked, title, onChange) {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'tree-checkbox';
    cb.checked = checked;
    cb.title = title;
    cb.addEventListener('change', (e) => { e.stopPropagation(); onChange(); });
    return cb;
}

function makeReviewButton(item, title, onClick) {
    const status = getItemSemanticStatus(item);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tree-review-btn is-${status.key}`;
    btn.title = title;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    btn.appendChild(makeIcon(status.icon, 'tree-review-icon'));
    return btn;
}

function makeIcon(name, extraClass) {
    const i = document.createElement('i');
    i.className = ['material-icons', extraClass].filter(Boolean).join(' ');
    i.textContent = name;
    return i;
}

function getItemSemanticStatus(item) {
    const hasDescription = !!(item.description && item.description.trim());
    if (!hasDescription) {
        return {
            key: 'missing',
            icon: 'edit_note',
            label: 'sem desc',
            title: 'Sem descrição'
        };
    }
    if (item.reviewed) {
        return {
            key: 'approved',
            icon: 'verified',
            label: 'aprovado',
            title: 'Descrição revisada e aprovada'
        };
    }
    return {
        key: 'review',
        icon: 'rate_review',
        label: 'revisar',
        title: 'Descrição preenchida, aguardando revisão'
    };
}

function makeSemanticBadge(item) {
    const status = getItemSemanticStatus(item);
    const badge = document.createElement('span');
    badge.className = `tree-semantic-badge is-${status.key}`;
    badge.textContent = status.label;
    badge.title = status.title;
    return badge;
}

function renderTreeView() {
    const treeContainer = document.getElementById('tree-view');
    treeContainer.innerHTML = '';

    const db = projectData.database;
    const tables = db.tables;

    // ── Database root node ──
    const isActiveDB = currentSelectedItem && currentSelectedItem.type === 'database';

    const activeTableIndices = tables
        .map((t, i) => ({ table: t, idx: i }))
        .filter(({ table }) => table.status !== 'REMOVED');
    const allCollapsed = activeTableIndices.length > 0 &&
        activeTableIndices.every(({ idx }) => collapseState[idx]);

    const dbSemanticStatus = getItemSemanticStatus(db);
    const dbItem = makeTreeItem([
        'is-db-root',
        dbSemanticStatus.key === 'approved' ? 'is-reviewed' : '',
        dbSemanticStatus.key === 'missing' ? 'is-undescribed' : '',
        dbSemanticStatus.key === 'review' ? 'is-needs-review' : '',
        isActiveDB ? 'is-active' : ''
    ]);

    // Collapse-all icon
    const collapseAllIcon = makeIcon(
        allCollapsed ? 'unfold_more' : 'unfold_less',
        'tree-collapse-all'
    );
    collapseAllIcon.title = allCollapsed ? 'Expandir tudo' : 'Recolher tudo';
    collapseAllIcon.addEventListener('click', (e) => { e.stopPropagation(); toggleCollapseAll(); });

    // DB review action
    const dbReviewButton = makeReviewButton(db, 'Alternar aprovação da descrição do banco', () => toggleReview('database'));

    // DB icon + name
    const dbIcon = makeIcon('storage', 'tree-item-icon');
    const dbName = document.createElement('span');
    dbName.className = 'tree-item-name';
    dbName.textContent = db.name;
    dbName.addEventListener('click', () => selectItem('database'));

    dbItem.append(collapseAllIcon, dbReviewButton, dbIcon, dbName, makeSemanticBadge(db));
    treeContainer.appendChild(dbItem);

    // ── Table nodes ──
    tables.forEach((table, tIdx) => {
        const isActiveTable = currentSelectedItem &&
            currentSelectedItem.type === 'table' &&
            currentSelectedItem.tableIndex === tIdx;
        const isCollapsed = !!collapseState[tIdx];

        const tableSemanticStatus = getItemSemanticStatus(table);
        const tableItem = makeTreeItem([
            'is-table',
            tableSemanticStatus.key === 'approved' ? 'is-reviewed' : '',
            tableSemanticStatus.key === 'missing' ? 'is-undescribed' : '',
            tableSemanticStatus.key === 'review' ? 'is-needs-review' : '',
            table.status === 'REMOVED' ? 'is-removed' : '',
            isActiveTable ? 'is-active' : ''
        ]);

        if (table.status !== 'REMOVED') {
            // Chevron accordion
            const chevron = makeIcon('expand_more', 'tree-chevron' + (isCollapsed ? ' is-collapsed' : ''));
            chevron.title = isCollapsed ? 'Expandir' : 'Recolher';
            chevron.addEventListener('click', (e) => { e.stopPropagation(); toggleCollapse(tIdx); });

            // Table review action
            const tReviewButton = makeReviewButton(table, 'Alternar aprovação da descrição da tabela', () => toggleReview('table', tIdx));

            // Table icon + name
            const tIcon = makeIcon('table_chart', 'tree-item-icon');
            const tName = document.createElement('span');
            tName.className = 'tree-item-name';
            tName.textContent = table.name;
            tName.addEventListener('click', (e) => { e.stopPropagation(); selectItem('table', tIdx); });

            // Badges
            if (table.status === 'NEW') {
                const badge = document.createElement('span');
                badge.className = 'tree-badge tree-badge-new';
                badge.textContent = 'novo';
                tableItem.append(chevron, tReviewButton, tIcon, tName, badge);
            } else if (table.status === 'RENAMED') {
                const badge = document.createElement('span');
                badge.className = 'tree-badge tree-badge-changed';
                badge.textContent = 'renomeado';
                tableItem.append(chevron, tReviewButton, tIcon, tName, badge);
            } else {
                tableItem.append(chevron, tReviewButton, tIcon, tName);
            }

            tableItem.appendChild(makeSemanticBadge(table));

        } else {
            // Removed table: simpler display
            const tIcon = makeIcon('table_chart', 'tree-item-icon');
            const tName = document.createElement('span');
            tName.className = 'tree-item-name';
            tName.textContent = table.name;
            const badge = document.createElement('span');
            badge.className = 'tree-badge tree-badge-removed';
            badge.textContent = 'removido';
            tableItem.append(tIcon, tName, badge);
        }

        treeContainer.appendChild(tableItem);

        // ── Column nodes ──
        if (table.status !== 'REMOVED') {
            table.columns.forEach((col, cIdx) => {
                const isActiveCol = currentSelectedItem &&
                    currentSelectedItem.type === 'column' &&
                    currentSelectedItem.tableIndex === tIdx &&
                    currentSelectedItem.columnIndex === cIdx;

                const colSemanticStatus = getItemSemanticStatus(col);
                const colItem = makeTreeItem([
                    'is-column',
                    colSemanticStatus.key === 'approved' ? 'is-reviewed' : '',
                    colSemanticStatus.key === 'missing' ? 'is-undescribed' : '',
                    colSemanticStatus.key === 'review' ? 'is-needs-review' : '',
                    isActiveCol ? 'is-active' : '',
                    isCollapsed ? 'tree-col-hidden' : ''
                ]);

                // Column review action
                const cReviewButton = makeReviewButton(col, 'Alternar aprovação da descrição do campo', () => toggleReview('column', tIdx, cIdx));

                // Column icon + name + type
                const cIcon = makeIcon('fiber_manual_record', 'tree-item-icon');
                const cName = document.createElement('span');
                cName.className = 'tree-item-name';
                cName.textContent = col.name;
                cName.addEventListener('click', (e) => { e.stopPropagation(); selectItem('column', tIdx, cIdx); });

                const cType = document.createElement('span');
                cType.className = 'tree-item-type';
                cType.textContent = col.type;

                colItem.append(cReviewButton, cIcon, cName, cType);

                // NEW badge
                if (col.status === 'NEW') {
                    const badge = document.createElement('span');
                    badge.className = 'tree-badge tree-badge-new';
                    badge.textContent = 'novo';
                    colItem.appendChild(badge);
                } else if (col.status === 'CHANGED') {
                    const badge = document.createElement('span');
                    badge.className = 'tree-badge tree-badge-changed';
                    badge.textContent = 'tipo';
                    colItem.appendChild(badge);
                }

                colItem.appendChild(makeSemanticBadge(col));

                treeContainer.appendChild(colItem);
            });
        }
    });

    renderStatusBar();
}

// ── Selection & Editor ────────────────────────────────────────────────────────

function selectItem(type, tIdx = null, cIdx = null) {
    currentSelectedItem = { type, tableIndex: tIdx, columnIndex: cIdx };
    renderTreeView();
    showEditor(true);
    loadItemToEditor();
}

function showEditor(show) {
    document.getElementById('editor-area').style.display = show ? 'block' : 'none';
}

function loadItemToEditor() {
    const item = getSelectedItem();
    const { type } = currentSelectedItem;
    let titlePrefix;

    if (type === 'database') {
        titlePrefix = 'Banco de Dados';
    } else if (type === 'table') {
        titlePrefix = 'Tabela';
    } else {
        titlePrefix = 'Coluna';
    }

    document.getElementById('editor-title').innerText = item.name;
    document.getElementById('editor-breadcrumb').innerText = titlePrefix;
    document.getElementById('item-description').value = item.description;
    editorDescriptionSnapshot = item.description || '';

    const chipsElem = document.querySelector('.chips');
    const chipData = (item.business_terms || []).map(t => ({ tag: t }));
    M.Chips.init(chipsElem, {
        data: chipData,
        placeholder: 'Adicionar termo',
        secondaryPlaceholder: '+Termo',
    });

    renderSelectedTableRelationships(type === 'table' ? item : null);
    updateEditorReviewAction();
}

function findTableIndexByName(tableName) {
    return projectData.database.tables.findIndex(table => table.name === tableName && table.status !== 'REMOVED');
}

function createRelationshipLink(tableName) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'relationship-table-link';
    link.textContent = tableName;
    link.addEventListener('click', () => {
        const tableIndex = findTableIndexByName(tableName);
        if (tableIndex >= 0) selectItem('table', tableIndex);
    });
    return link;
}

function createRelationshipItem(relationship, mode) {
    const item = document.createElement('li');
    item.className = 'relationship-item';

    const tableLink = createRelationshipLink(relationship.table);
    const columns = document.createElement('span');
    columns.className = 'relationship-columns';
    columns.textContent = mode === 'parent'
        ? `${relationship.local_columns.join(', ')} → ${relationship.referenced_columns.join(', ')}`
        : `${relationship.local_columns.join(', ')} ← ${relationship.referenced_columns.join(', ')}`;

    item.append(tableLink, columns);
    return item;
}

function renderRelationshipList(title, icon, relationships, mode) {
    const group = document.createElement('div');
    group.className = 'relationship-group';

    const heading = document.createElement('div');
    heading.className = 'relationship-group-title';
    heading.innerHTML = `<i class="material-icons">${icon}</i><span>${title}</span>`;

    const list = document.createElement('ul');
    list.className = 'relationship-list';

    if (relationships.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'relationship-empty';
        empty.textContent = 'Nenhum relacionamento identificado.';
        list.appendChild(empty);
    } else {
        relationships.forEach(relationship => list.appendChild(createRelationshipItem(relationship, mode)));
    }

    group.append(heading, list);
    return group;
}

function renderSelectedTableRelationships(table) {
    const section = document.getElementById('relationships-section');
    const box = document.getElementById('relationships-box');
    if (!section || !box) return;

    section.hidden = !table;
    box.innerHTML = '';
    if (!table) return;

    const relationships = table.relationships || { parents: [], children: [] };
    box.append(
        renderRelationshipList('Filha de', 'call_received', relationships.parents || [], 'parent'),
        renderRelationshipList('Mãe de', 'call_made', relationships.children || [], 'child')
    );
}

function getSelectedItem() {
    if (!currentSelectedItem) return;

    const { type, tableIndex, columnIndex } = currentSelectedItem;

    if (type === 'database') {
        return projectData.database;
    }

    if (type === 'table') {
        return projectData.database.tables[tableIndex];
    }

    return projectData.database.tables[tableIndex].columns[columnIndex];
}

function persistEditorFields(item) {
    const nextDescription = document.getElementById('item-description').value;
    if (item.reviewed && nextDescription !== editorDescriptionSnapshot) {
        item.reviewed = false;
    }
    item.description = nextDescription;

    const chipsElem = document.querySelector('.chips');
    const chipInstance = M.Chips.getInstance(chipsElem);
    item.business_terms = chipInstance.chipsData.map(c => c.tag);
    editorDescriptionSnapshot = item.description || '';
}

function saveCurrentItemChanges() {
    const item = getSelectedItem();
    if (!item) return;

    persistEditorFields(item);

    M.toast({ html: 'Alterações salvas temporariamente.' });
    renderTreeView();
    updateEditorReviewAction();
}

function updateEditorReviewAction() {
    const item = getSelectedItem();
    const btn = document.getElementById('btn-review-item');
    if (!btn || !item) return;

    const description = document.getElementById('item-description').value.trim();
    const canReview = description.length > 0;
    const isApproved = canReview && !!item.reviewed;
    btn.disabled = !canReview;
    btn.classList.toggle('is-approved', isApproved);
    btn.innerHTML = isApproved
        ? '<i class="material-icons">undo</i> Reabrir Revisão'
        : '<i class="material-icons">verified</i> Aprovar Descrição';
    btn.title = canReview
        ? 'Marca a descrição deste item como revisada e aprovada'
        : 'Preencha a descrição antes de aprovar';
}

function toggleCurrentItemReview() {
    const item = getSelectedItem();
    if (!item) return;

    persistEditorFields(item);
    if (!item.description || !item.description.trim()) {
        M.toast({ html: 'Preencha a descrição antes de aprovar.' });
        updateEditorReviewAction();
        return;
    }

    item.reviewed = !item.reviewed;
    M.toast({ html: item.reviewed ? 'Descrição aprovada.' : 'Descrição reaberta para revisão.' });
    renderTreeView();
    updateEditorReviewAction();
}

// ── Review (check) ────────────────────────────────────────────────────────────

function toggleReview(type, tIdx, cIdx) {
    const db = projectData.database;
    let item;

    if (type === 'database') {
        item = db;
    } else if (type === 'table') {
        item = db.tables[tIdx];
    } else if (type === 'column') {
        item = db.tables[tIdx].columns[cIdx];
    }

    if (!item) return;

    if (!item.reviewed && (!item.description || !item.description.trim())) {
        M.toast({ html: 'Preencha a descrição antes de aprovar.' });
        return;
    }

    item.reviewed = !item.reviewed;

    renderTreeView();
    updateEditorReviewAction();
}

// ── Collapse / Accordion ──────────────────────────────────────────────────────

function toggleCollapse(tIdx) {
    collapseState[tIdx] = !collapseState[tIdx];
    renderTreeView();
}

function toggleCollapseAll() {
    const tables = projectData.database.tables;
    const activeTableIndices = tables
        .map((t, i) => ({ table: t, idx: i }))
        .filter(({ table }) => table.status !== 'REMOVED');

    const allCollapsed = activeTableIndices.every(({ idx }) => collapseState[idx]);

    // If all are collapsed → expand all; otherwise → collapse all
    activeTableIndices.forEach(({ idx }) => {
        collapseState[idx] = !allCollapsed;
    });

    renderTreeView();
}

// ── Persistence ───────────────────────────────────────────────────────────────

function openSavePrompt() {
    if (typeof document === 'undefined') return;
    const input = document.getElementById('save-prompt-filename');
    const error = document.getElementById('save-prompt-error');
    const suggestion = suggestSaveFilename({
        currentProjectBaseName,
        projectData,
        sqlDatabaseName
    });
    input.value = suggestion;
    error.textContent = '';
    document.getElementById('save-prompt-modal').classList.add('is-open');
    setTimeout(() => {
        const dot = suggestion.lastIndexOf('.');
        const stem = dot > 0 ? suggestion.slice(0, dot) : suggestion;
        try { input.setSelectionRange(stem.length, suggestion.length); } catch (e) { /* noop */ }
        input.focus();
    }, 50);
}

function closeSavePrompt() {
    if (typeof document === 'undefined') return;
    document.getElementById('save-prompt-modal').classList.remove('is-open');
}

function confirmSavePrompt() {
    const input = document.getElementById('save-prompt-filename');
    const error = document.getElementById('save-prompt-error');
    const result = sanitizeUserFilename(input.value);
    if (!result.ok) {
        error.textContent = result.reason;
        return;
    }
    error.textContent = '';
    currentProjectBaseName = stripTimestampPrefix(result.filename.replace(/\.json$/i, ''));
    downloadProjectJSON(result.filename);
    closeSavePrompt();
}

function downloadProjectJSON(filename) {
    if (typeof document === 'undefined') return;
    const dataStr = JSON.stringify(projectData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function handleJSONUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const json = JSON.parse(e.target.result);
            if (!json.database) throw new Error("Formato de JSON inválido.");

            // Ensure backward compatibility: add missing fields
            if (json.database.reviewed === undefined) json.database.reviewed = false;
            if (!json.database.description) json.database.description = "";
            if (!json.database.business_terms) json.database.business_terms = [];

            json.database.tables.forEach(table => {
                if (table.reviewed === undefined) table.reviewed = false;
                table.relationships = table.relationships || { parents: [], children: [] };
                table.columns.forEach(col => {
                    if (col.reviewed === undefined) col.reviewed = false;
                    if (col.primary_key === undefined) col.primary_key = false;
                    if (col.foreign_key === undefined) col.foreign_key = false;
                });
            });
            json.database.tables = normalizeRelationships(json.database.tables);

            const rawName = file.name || '';
            const stem = rawName.replace(/\.json$/i, '');
            currentProjectBaseName = stripTimestampPrefix(stem) || null;
            sqlDatabaseName = null;

            projectData = json;
            hasLoadedProject = true;
            updateUpdateModelButton();
            collapseState = {};
            renderTreeView();
            showEditor(false);
            document.getElementById('welcome-screen').style.display = 'none';
            M.toast({ html: 'Projeto carregado com sucesso!' });
        } catch (err) {
            M.toast({ html: 'Erro ao carregar JSON.' });
        }
    };
    reader.readAsText(file);
}

// ── Save Prompt Helpers ──────────────────────────────────────────────────────

function buildTimestamp(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function stripTimestampPrefix(stem) {
    return String(stem || '').replace(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-/, '');
}

function slugifyBaseName(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');
}

function resolveBaseName(state) {
    const recorded = state && state.currentProjectBaseName;
    if (recorded) return slugifyBaseName(recorded);

    const dbName = state && state.projectData && state.projectData.database && state.projectData.database.name;
    if (dbName && dbName !== 'Novo Banco') return slugifyBaseName(dbName);

    const sqlName = state && state.sqlDatabaseName;
    if (sqlName) return slugifyBaseName(sqlName);

    return 'mapper';
}

function suggestSaveFilename(state, date) {
    const ts = buildTimestamp(date || new Date());
    return `${ts}-${resolveBaseName(state)}.json`;
}

function sanitizeUserFilename(value) {
    let name = String(value || '').trim();
    if (!name) return { ok: false, reason: 'Informe um nome de arquivo.' };
    name = name.replace(/\.json$/i, '');
    name = name.replace(/[^A-Za-z0-9._-]/g, '-');
    if (!name) return { ok: false, reason: 'Informe um nome de arquivo.' };
    return { ok: true, filename: `${name}.json` };
}

if (typeof module !== 'undefined') {
    module.exports = {
        parseSQLToTables,
        parseAlterTableForeignKeys,
        normalizeRelationships,
        computeStats,
        setProjectData: (db) => { projectData = db; },
        createUpdateWizardState,
        buildTablePlans,
        buildColumnGroups,
        buildRelationshipGroups,
        applyUpdateWizardState,
        buildTimestamp,
        stripTimestampPrefix,
        slugifyBaseName,
        resolveBaseName,
        suggestSaveFilename,
        sanitizeUserFilename
    };
}
