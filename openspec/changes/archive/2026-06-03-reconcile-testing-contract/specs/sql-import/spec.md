## ADDED Requirements

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
