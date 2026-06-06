## Why

The DBMapper app (a static HTML/JS tool for enriching SQL schemas with semantic metadata) was built without OpenSpec. The codebase already exposes seven well-bounded capabilities — SQL import, project persistence, schema tree, semantic editor, coverage stats, model update wizard, and the read-only DBViewr — but none of them are documented as specs. We need to backfill the spec layer now so that every future change is grounded in a written contract, and so that the team can reason about scope, regressions, and refactors from `openspec/specs/` instead of from `app.js` only.

## What Changes

- Document seven new capabilities that already exist in code as the baseline spec set:
  - `sql-import`: parsing of `CREATE TABLE` / `ALTER TABLE ADD CONSTRAINT` from a user-supplied `.sql` file, including PK, inline FK, FK constraint, and bidirectional relationship normalization.
  - `project-persistence`: in-memory model and JSON export/import contract shared by DBMapper and DBViewr.
  - `schema-tree`: sidebar tree of database → tables → columns with semantic status badges, change badges, collapse/expand, and active selection.
  - `semantic-editor`: per-item editor for description, business terms (chips), approve/reopen review workflow, and the table-level relationships panel.
  - `coverage-stats`: status bar metrics for totals, described/reviewed coverage, pending count, and overall progress percentage.
  - `model-update-wizard`: 5-step diff wizard (`upload` → `tables` → `columns` → `relationships` → `summary`) that merges a new SQL into the current project while preserving existing metadata on kept/renamed items.
  - `dbviewr`: read-only data dictionary page that consumes the same project JSON, with search, table navigation, relationships panel, theme toggle, and `REMOVED`-table filtering.
- Reconcile the test contract: `AGENTS.md` currently says "no automated tests" while two Node `assert` scripts exist under `tests/`; we will not change that, but the new specs will reference the relevant scripts as the executable surface.
- No application code is modified. This change is documentation-only.

## Capabilities

### New Capabilities

- `sql-import`: Importing `.sql` files and turning their `CREATE TABLE` / `ALTER TABLE` definitions into a normalized in-memory table list with columns, PKs, FKs, and bidirectional parent/child relationships.
- `project-persistence`: The JSON project format (`database.{name, description, business_terms, reviewed, tables[]}`) and the export/import round-trip with legacy field backfill.
- `schema-tree`: Sidebar tree rendering for database/table/column items, including semantic status badges (`missing`/`review`/`approved`), change badges (`NEW`/`RENAMED`/`CHANGED`/`REMOVED`), collapse/expand per table, collapse-all, and active item highlighting.
- `semantic-editor`: Item editor that loads the selected database/table/column, edits description and business terms, approves or reopens review, and (for tables) renders parent/child relationships.
- `coverage-stats`: Status bar that surfaces total tables/columns, described coverage, reviewed coverage, pending count, and overall percentage progress with color thresholds (`<30%` low, `<70%` mid, otherwise high).
- `model-update-wizard`: Wizard that diffs the current project against a newly imported SQL, lets the user choose per-table/per-column/per-FK actions (`keep`/`delete`/`rename`/`add`), preserves metadata on kept/renamed items, summarizes the diff, and applies it to the project.
- `dbviewr`: Read-only data dictionary page (`dbviewr.html`) that loads a project JSON, supports search and table navigation, renders relationships with "Filha de"/"Mãe de" labels, hides `REMOVED` tables, supports a light/dark theme persisted in `localStorage`, and copies per-table anchor links.

### Modified Capabilities

_None — `openspec/specs/` is currently empty, so every capability in this change is new._

## Impact

- `openspec/specs/`: 7 new capability directories will be created when this change is archived.
- `openspec/changes/bootstrap-initial-specs/specs/`: 7 delta spec files will live here during the lifetime of the change.
- Source code (`app.js`, `index.html`, `style.css`, `dbviewr.html`): not modified. This change documents behavior that already exists.
- Tests (`tests/update-model.test.js`, `tests/dbviewr.test.js`): not modified. They are referenced by `model-update-wizard` and `dbviewr` as the executable contract.
- `AGENTS.md`: no edit. We are not changing the "no automated tests configured" guideline; the two existing scripts are tolerated as ad-hoc Node checks, consistent with the current guidance.
- No external dependencies, no build step, no deployment impact.
