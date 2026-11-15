# model-import Specification

## Purpose
Ingest an updated SQL script into a stored dictionary project: parse it with the v1 grammar subset, diff it against the current model, preview the change plan without mutating anything, and apply the confirmed plan with strict metadata-preservation guarantees — recording every applied run. Executable coverage: ported parser/diff contracts (`packages/sql-parser`, `packages/model-diff`) and API integration tests.

## Requirements

### Requirement: SQL parsing with the v1 grammar subset

The import MUST parse `CREATE TABLE` and `ALTER TABLE ... ADD [CONSTRAINT] FOREIGN KEY` using the v1 parser's grammar subset, producing normalized tables and columns with bidirectional, deduplicated parent/child relationships.

#### Scenario: Full schema round-trip
- **WHEN** a script with several `CREATE TABLE`s (inline and table-level `PRIMARY KEY`, inline and named `FOREIGN KEY`, `CONSTRAINT` clauses), an `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`, quoted (`"`, `` ` ``, `[]`) and schema-qualified identifiers, and types with parenthesised arguments (`decimal(10,2)`) is submitted
- **THEN** the parsed model contains every table, column, primary key and foreign key, with relationships normalized in both directions and deduplicated

#### Scenario: Script without CREATE TABLE fails
- **WHEN** the submitted SQL contains no `CREATE TABLE`
- **THEN** the response is `400` with the standard error envelope and the stored model is unchanged

### Requirement: Unsupported DDL is skipped

Constructs outside the v1 grammar subset MUST be skipped without failing the import.

#### Scenario: Unsupported DDL is ignored
- **WHEN** the script contains `CREATE VIEW`, `CREATE INDEX`, `CHECK`/`UNIQUE` constraints and `ALTER TABLE ... ADD COLUMN`
- **THEN** parsing succeeds and those constructs do not appear in the model

### Requirement: Non-mutating diff preview

The API MUST compute a plan comparing the parsed SQL against the stored model — tables and columns classified as kept, added, removed, or type-changed, plus added/removed foreign keys — without changing the stored model. Renames MUST only come from an explicit client-provided mapping; the system MUST NOT infer renames automatically.

#### Scenario: Preview classifies changes
- **WHEN** a preview is requested for SQL that adds one table, drops one column, changes one column type and adds one FK
- **THEN** the plan marks exactly those items as added/removed/changed/new-FK and everything else as kept

#### Scenario: Preview does not mutate
- **WHEN** a preview is requested and then abandoned
- **THEN** the stored model is byte-for-byte unchanged and no `import_runs` row is created

#### Scenario: Renames are explicit only
- **WHEN** a preview is requested where a table disappeared and another appeared
- **THEN** they are classified as removed and added respectively, unless the client supplies a rename mapping, in which case the plan shows a rename

### Requirement: Apply preserves metadata of kept items

Applying a confirmed plan MUST preserve `description`, `business_terms` and `reviewed` for kept and renamed items; added items MUST start empty (`description: ""`, `business_terms: []`, `reviewed: false`, `status: "NEW"`); type changes MUST update the type and set `status: "CHANGED"`; removed items MUST be deleted from the model; relationships after apply MUST reflect the new SQL for kept and renamed tables.

#### Scenario: Kept table keeps its documentation
- **WHEN** a table with described and approved columns is present in both the stored model and the new SQL
- **THEN** after apply every description, business term and `reviewed` flag of that table and its kept columns is unchanged

#### Scenario: Renamed table keeps its documentation
- **WHEN** a plan renames a table via an explicit mapping
- **THEN** after apply the table has the new name and its original `description`, `business_terms` and `reviewed` (and those of its renamed columns)

#### Scenario: New column starts for review
- **WHEN** the plan adds a column
- **THEN** after apply the column exists with empty metadata, `reviewed: false` and `status: "NEW"`, ready for the review workflow

#### Scenario: Type change is flagged
- **WHEN** a column's type differs between stored model and new SQL
- **THEN** after apply the column has the new type and `status: "CHANGED"`

### Requirement: Applied imports are recorded

Every successful apply MUST append an `import_runs` row with the SQL hash, a snapshot of the applied plan and a timestamp; previews MUST NOT create rows.

#### Scenario: Apply creates history
- **WHEN** a plan is applied
- **THEN** a new `import_runs` row exists for the project with the SQL hash and plan snapshot, ordered as the most recent run

#### Scenario: Rejected apply creates nothing
- **WHEN** apply fails validation
- **THEN** the model is unchanged, no `import_runs` row is added and the response uses the error envelope
