## Why

The `AGENTS.md` "Testing Guidelines" section claims "No automated tests are currently configured", but two ad-hoc Node `assert` scripts (`tests/update-model.test.js` for the wizard, `tests/dbviewr.test.js` for the viewer) actually exist and are referenced by the archived `model-update-wizard` and `dbviewr` specs. Meanwhile, the `sql-import` capability has no dedicated test file at all — its parser is exercised only indirectly through the wizard test. The bootstrap change explicitly deferred this as item 6.1 and 6.2 in its follow-up housekeeping. We are resolving both at once: align `AGENTS.md` with reality, and add a dedicated test file for the parser so its contract is locked in by an executable check.

## What Changes

- **Add** `tests/sql-import.test.js` — a Node `assert` script that exercises the `parseSQLToTables`, `parseAlterTableForeignKeys`, and `normalizeRelationships` functions against the scenarios already captured in the `sql-import` spec (column extraction, PK/FK parsing, ALTER TABLE, bidirectional normalization, deduplication).
- **Modify** `AGENTS.md` "Testing Guidelines" — replace the "no automated tests are currently configured" sentence with a section that names each `tests/*.test.js` script as the executable contract for its corresponding capability, and instructs future agents to run the relevant test before considering a change done.
- **Modify** the `sql-import` spec to add a new Requirement "Parser test contract" that points to the new test file as the executable surface for the capability. The existing 5 Requirements stay unchanged.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `sql-import`: Add a new Requirement `Parser test contract` that requires `tests/sql-import.test.js` to exist and to cover the existing scenarios. The existing 5 Requirements (`SQL file ingestion`, `CREATE TABLE column extraction`, `Inline and named foreign key parsing`, `ALTER TABLE foreign key ingestion`, `Bidirectional relationship normalization`) keep their current text and scenarios.

## Impact

- `tests/sql-import.test.js`: new file, executable via `node tests/sql-import.test.js`. No new test framework; same `node:assert/strict` style as the two existing scripts.
- `AGENTS.md`: edit to the "Testing Guidelines" section. No other section of `AGENTS.md` is changed.
- `openspec/specs/sql-import/spec.md`: one new Requirement block added under the existing 5. The spec's `## Purpose` paragraph is intentionally left untouched here and will be filled in by the follow-up `fill-spec-purposes` change.
- `app.js`, `index.html`, `style.css`, `dbviewr.html`: not modified.
- `model-update-wizard` and `dbviewr` test files: not modified. They keep working as before.
- No build step, no new dependencies, no deployment impact.
