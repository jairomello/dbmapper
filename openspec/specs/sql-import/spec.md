# sql-import Specification

## Purpose
Converts a user-supplied `.sql` file into a normalized in-memory list of tables with columns, primary keys, and foreign keys, and derives bidirectional parent/child relationships. The parser handles `CREATE TABLE` bodies (column definitions, inline PK/FK, named `FOREIGN KEY` constraints) and `ALTER TABLE ADD CONSTRAINT FOREIGN KEY` statements, including quoted and schema-qualified identifiers and types with parenthesised arguments such as `decimal(10,2)`. The executable contract for this capability is `tests/sql-import.test.js`; it is also exercised indirectly by `tests/update-model.test.js`.
## Requirements
### Requirement: SQL file ingestion

The system MUST accept a user-supplied `.sql` file via the "Importar SQL" button and convert it into an in-memory list of tables that the rest of the app can consume.

#### Scenario: Successful import of a multi-table file
- **WHEN** the user picks a `.sql` file containing two or more `CREATE TABLE` statements
- **THEN** the system MUST replace `projectData.database.tables` with a normalized table list parsed from that file
- **AND** the sidebar tree MUST render every parsed table with its columns

#### Scenario: File with no CREATE TABLE statements
- **WHEN** the user picks a `.sql` file that contains no `CREATE TABLE` statements
- **THEN** the parser MUST throw an `Error` whose message is `Nenhuma tabela encontrada. Verifique se o arquivo contém comandos 'CREATE TABLE' válidos.`
- **AND** the importer MUST catch the error, surface a `M.toast` with the message `Erro ao processar SQL. Verifique o console.`, and log the underlying error to the console
- **AND** the previous project data MUST be left unchanged

#### Scenario: Import without a previously loaded project
- **WHEN** the user imports a `.sql` file before ever loading a JSON project
- **THEN** the welcome screen MUST be hidden
- **AND** the "Atualizar Modelo" button MUST remain hidden (`hasLoadedProject === false`)

### Requirement: CREATE TABLE column extraction

The parser MUST extract every column definition inside a `CREATE TABLE` body, including its name, normalized type, primary key flag, and foreign key flag, while ignoring constraints and non-column lines.

#### Scenario: Inline primary key
- **WHEN** a column line contains the literal `PRIMARY KEY`
- **THEN** the resulting column record MUST have `primary_key: true`

#### Scenario: Inline foreign key via column-level REFERENCES
- **WHEN** a column line contains `REFERENCES <table>(<col>)`
- **THEN** the resulting column record MUST have `foreign_key: true`
- **AND** a parent relationship MUST be added to that table

#### Scenario: Constraint lines are not treated as columns
- **WHEN** the parser encounters lines starting with `CONSTRAINT`, `UNIQUE`, `CHECK`, or `KEY`
- **THEN** the system MUST skip them and MUST NOT add them as columns

#### Scenario: Tabular PRIMARY KEY constraint marks the listed columns
- **WHEN** a `CREATE TABLE` body contains a `PRIMARY KEY (col1, col2, ...)` line
- **THEN** every column named in that list MUST be marked with `primary_key: true`

### Requirement: Inline and named foreign key parsing

The parser MUST capture every foreign key declared inside a `CREATE TABLE` body, whether as a column-level `REFERENCES` clause or as a `FOREIGN KEY` constraint line, and record it as a parent relationship.

#### Scenario: Named FOREIGN KEY constraint
- **WHEN** a `CREATE TABLE` body contains `CONSTRAINT fk_x FOREIGN KEY (a, b) REFERENCES other (c, d)`
- **THEN** the table MUST gain a parent relationship with `table: "other"`, `local_columns: ["a","b"]`, `referenced_columns: ["c","d"]`, and `constraint_name: "fk_x"`

#### Scenario: Quoted identifiers
- **WHEN** an identifier is wrapped in backticks, double quotes, or square brackets
- **THEN** the parser MUST strip the surrounding quotes/brackets before storing the name
- **AND** schema-qualified identifiers (e.g. `public.users`) MUST be stored as `users`

#### Scenario: Quoted and nested commas inside a definition
- **WHEN** a column type contains commas inside parentheses (e.g. `decimal(10,2)`)
- **THEN** the splitter MUST NOT split the column on that comma
- **AND** the column MUST be captured as a single definition

### Requirement: ALTER TABLE foreign key ingestion

The parser MUST additionally scan the SQL for `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES ...` statements and attach the resulting relationships to the matching tables.

#### Scenario: ALTER TABLE adds two FKs
- **WHEN** the SQL contains two `ALTER TABLE async_job ADD CONSTRAINT ... FOREIGN KEY (...) REFERENCES ... (id)` statements
- **THEN** the `async_job` table MUST have two parent relationships, one per ALTER statement
- **AND** each local column listed in the FK MUST have `foreign_key: true`

#### Scenario: ALTER TABLE targets a table absent from CREATE TABLE
- **WHEN** an `ALTER TABLE` references a table that was not defined in the same file
- **THEN** the parser MUST skip that statement without raising

### Requirement: Bidirectional relationship normalization

After parsing, the system MUST derive child relationships from parent relationships so that any table referenced as a parent appears in the referencer's `children` list with the columns swapped.

#### Scenario: Parent and child are both recorded
- **WHEN** table `pedido` has a parent relationship to `cliente` on `pedido.cliente_id → cliente.id`
- **THEN** `cliente.relationships.children` MUST contain a relationship to `pedido` with `local_columns: ["id"]` and `referenced_columns: ["cliente_id"]`

#### Scenario: Duplicate relationships are deduplicated
- **WHEN** the same relationship is declared more than once for a table
- **THEN** the resulting `parents` and `children` lists MUST each contain that relationship exactly once

### Requirement: Parser test contract

The repository MUST provide a Node `assert` script at `tests/sql-import.test.js` that exercises the parser functions exported by `app.js` against the scenarios in the `sql-import` spec, and the script MUST exit with status `0` after printing a final `tests/sql-import.test.js: ok` line.

#### Scenario: Script exists and exits 0
- **WHEN** a future change touches any of the parser functions in `app.js` (`parseSQLToTables`, `parseAlterTableForeignKeys`, `normalizeRelationships`)
- **THEN** `node tests/sql-import.test.js` MUST exit `0`
- **AND** the script MUST end with `console.log('sql-import.test.js: ok')` (or the final `tests/sql-import.test.js: ok` line) before exiting

#### Scenario: Script uses the same style as the existing two scripts
- **WHEN** `tests/sql-import.test.js` is read
- **THEN** it MUST import `node:assert/strict`
- **AND** it MUST import the parser functions via `require('../app.js')`
- **AND** it MUST NOT introduce a test framework, a `package.json` test script, or any external dependency

#### Scenario: Script covers the parser scenarios
- **WHEN** `tests/sql-import.test.js` runs
- **THEN** it MUST contain at least one assertion for each of the following parser behaviors: column extraction (name and type captured), inline primary key, inline foreign key via column-level `REFERENCES`, named `FOREIGN KEY` constraint, quoted identifiers and schema-qualified names, parenthesised types with commas (e.g. `decimal(10,2)`), `ALTER TABLE` adding two foreign keys, `ALTER TABLE` on a missing table being skipped, parent/child bidirectional normalization, and duplicate-relationship deduplication

### Requirement: Capability Purpose paragraph
The `## Purpose` section of this spec MUST describe the capability in 1–3 behavior-oriented sentences, must NOT contain the placeholder `TBD - created by archiving`, and MUST name the executable test script (if any) and the cross-cutting `project-persistence` contract (if relevant).

#### Scenario: Purpose paragraph is non-placeholder
- **WHEN** a reader opens this spec file
- **THEN** the `## Purpose` section MUST NOT contain the string `TBD - created by archiving`
- **AND** the section MUST contain at least one complete sentence describing the capability's user-facing responsibility

### Requirement: Page is served under the static-site-security controls

The page that hosts this capability (`dbmapper.html`) MUST be served with the SRI, CSP, and "no inline scripts/handlers" controls defined in the `static-site-security` specification.

#### Scenario: Page is served under static-site-security

- **WHEN** `dbmapper.html` is loaded
- **THEN** the page MUST satisfy every `Requirement` of the `static-site-security` capability (SRI on every CDN resource including the Materialize CSS and JS at version `1.0.0` on cdnjs, a `<meta http-equiv="Content-Security-Policy">` in the head, no inline `<script>` or `<style>` block, no `on*=` handlers, and external CSS/JS in standalone files)

