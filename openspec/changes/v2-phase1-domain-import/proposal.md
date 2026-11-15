# Proposal

## Why

Phase 1 of `ROADMAP.md`: the dictionary domain must exist on the server before auth, UI, agent or MCP work can land. This change delivers the complete SQLite schema for the dictionary, ports the v1 SQL parser and update-wizard diff (the functional heart of the product) with their executable contracts, exposes a REST API to create/save projects and import SQL with preview/apply, and guarantees the export keeps the v1 JSON contract that DBViewer and downstream AI consumers already rely on.

## What Changes

- Full dictionary schema in Drizzle/SQLite: `projects`, `tables`, `columns`, `relationships` (with review metadata: `reviewed`, `description_source`, `reviewed_by/at`) and `import_runs` (history of applied SQL updates).
- Port `packages/sql-parser` (from `legacy/app.js` lines 147–452) and `packages/model-diff` (lines 538–819) as pure TypeScript packages; port their v1 contracts (`sql-import`, `update-model` tests) to `bun test`.
- REST API (`apps/api`): project CRUD, JSON export in the exact v1 contract shape, JSON import with v1 backfill, and SQL import flow — parse → diff preview → confirmed apply — preserving descriptions/terms/review on kept and renamed items.
- Persistence layer: slim ports + SQLite adapter + composition root (routes never import Drizzle), with a boundary-check script in the `bun run check` gate.
- Every applied import is recorded in `import_runs` (SQL hash, diff snapshot, timestamp).

## Capabilities

### New Capabilities
- `project-api`: REST surface for dictionary projects — create, list, get, save; export in the v1 JSON contract; import of v1 JSON with backfill; standard error envelope.
- `model-import`: ingest updated SQL, parse it (CREATE TABLE / ALTER TABLE ADD CONSTRAINT rules from v1), diff against the stored model (added/removed/renamed tables and columns, type changes, FK changes), preview the plan, and apply it with metadata preservation guarantees.

### Modified Capabilities
_None — the eight existing capabilities describe the frozen v1 static app in `legacy/` and stay untouched._

## Non-goals

- Auth/users/papéis (Fase 2), React UI (Fase 3), agent suggestions (Fase 4), MCP/skill (Fase 5), filename-suggestion helpers, DBViewer route, coverage stats, PostgreSQL, WebSocket.

## Impact

- New: `packages/sql-parser`, `packages/model-diff`, `apps/api/src/{routes,services,db,persistence}`, API integration tests, `check:persistence`-style boundary script.
- Contract risk is the sharp edge: export output must match the v1 shape field-for-field (verified by a contract test against the v1 fixture).
- `legacy/` untouched; v1 tests keep passing. Existing gates (`bun run check`) extend with the new suites.
