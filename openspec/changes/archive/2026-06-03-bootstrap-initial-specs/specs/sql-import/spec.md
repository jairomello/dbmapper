## ADDED Requirements

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
