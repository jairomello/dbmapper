# schema-ddl Specification

## Purpose
Turn the stored dictionary into executable SQL: generate a full create script
or a migration script against a captured baseline, in a selected dialect, with
explicit rename mapping and visible warnings for destructive or lossy
operations — without ever connecting to the target database.

## Requirements

### Requirement: Full DDL script

The API MUST generate a create script for the project's model containing every
non-`REMOVED` table with its columns, types, primary key and foreign keys. The
script MUST be deterministic for the same model and dialect, and MUST NOT
contain documentation fields (description, business terms, review state).

#### Scenario: Script covers the whole model

- **WHEN** a `MEMBER` requests the create script for a project with two tables and one foreign key
- **THEN** the script contains both `CREATE TABLE` statements with their columns and primary keys
- **AND** it contains the foreign-key constraint between them
- **AND** it contains no description or business-term text

#### Scenario: Removed tables are left out

- **WHEN** the model has a table with status `REMOVED`
- **THEN** the create script does not mention that table

#### Scenario: Output is stable

- **WHEN** the same model and dialect are requested twice
- **THEN** both scripts are identical

### Requirement: Migration script against a baseline

The API MUST generate a migration script that transforms the project's captured
baseline into the current model: tables and columns added, removed or with a
changed type, plus foreign keys added or removed. The script MUST list the
destructive statements separately so the client can warn before use.

#### Scenario: Added table and column

- **WHEN** the model gained one table and one column since the baseline
- **THEN** the migration script contains the matching `CREATE TABLE` and `ALTER TABLE ... ADD COLUMN`

#### Scenario: Type change

- **WHEN** a column's type differs from the baseline
- **THEN** the migration script emits the dialect's column-type change statement for that column
- **AND** the statement is reported as potentially lossy

#### Scenario: Destructive statements are reported

- **WHEN** a table or column present in the baseline no longer exists in the model
- **THEN** the migration script contains the corresponding `DROP`
- **AND** the response lists it as a destructive operation

#### Scenario: No baseline

- **WHEN** the project has no captured baseline and migration mode is requested
- **THEN** the response is `409` with the standard error envelope and code `DDL_BASELINE_MISSING`
- **AND** the create mode remains available

### Requirement: Renames require explicit mapping

Renames MUST only be emitted as `ALTER ... RENAME` when the request supplies an
explicit mapping from the baseline name to the current name. Without a mapping,
the pair MUST be treated as a removal plus an addition, and the response MUST
warn that the operation loses data.

#### Scenario: Explicit rename produces a rename statement

- **WHEN** the request maps baseline table `cliente` to current table `clientes`
- **THEN** the migration script renames the table instead of dropping and creating it

#### Scenario: Missing mapping warns about data loss

- **WHEN** the baseline has table `cliente` and the model has `clientes` with no mapping
- **THEN** the script drops `cliente` and creates `clientes`
- **AND** the response includes a data-loss warning for that pair

### Requirement: Dialect and type mapping

The API MUST support the dialects `postgres` and `mysql`, quoting identifiers
according to the selected dialect and converting the model's common types
(integer, serial, varchar with size, decimal, date, timestamp and boolean).
Unknown type text MUST be emitted unchanged and reported as a warning instead
of failing the request.

#### Scenario: Dialect quoting

- **WHEN** the same model is generated for `postgres` and for `mysql`
- **THEN** identifiers are quoted per dialect (`"name"` vs `` `name` ``)
- **AND** the dialect's sequence/auto-increment form is used for serial columns

#### Scenario: Unknown type does not break generation

- **WHEN** a column uses a type the mapping does not know
- **THEN** generation succeeds with the type emitted as stored
- **AND** the response includes a warning naming that column

### Requirement: Baseline capture

The API MUST keep one baseline per project, captured automatically when a SQL
import is applied and on explicit request; capturing MUST be audited with
`ddl.baseline_captured` in the same transaction. A captured baseline MUST be
readable back and MUST only contain structure (tables, columns, types, primary
and foreign keys), never documentation.

#### Scenario: Import captures the baseline

- **WHEN** a `MEMBER` applies a SQL import
- **THEN** the project baseline equals the imported structure
- **AND** an `ddl.baseline_captured` event exists for the run

#### Scenario: Manual capture after applying the script

- **WHEN** a `MEMBER` marks the database as synchronized
- **THEN** the current model becomes the baseline

#### Scenario: Viewer cannot capture

- **WHEN** a `VIEWER` calls the baseline endpoint
- **THEN** the response is `403` with the error envelope and the baseline is unchanged

#### Scenario: Baseline is readable back

- **WHEN** an authenticated caller reads the project baseline
- **THEN** the response carries the stored baseline document with its capture metadata
- **AND** a project that never captured a baseline gets `baseline: null`

### Requirement: Generation access and safety

Generating a script MUST be available to any authenticated caller, MUST NOT
modify the stored model, layout or baseline, and MUST NOT connect to any
database or accept database credentials.

#### Scenario: Generation is read-only

- **WHEN** a script is generated
- **THEN** no `events` row is appended and the stored data is unchanged

#### Scenario: No credentials accepted

- **WHEN** a request includes connection settings for a target database
- **THEN** they are ignored and never persisted
