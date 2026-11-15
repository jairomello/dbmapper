# Tasks

## 1. Schema e migração do domínio

- [x] 1.1 Extend `apps/api/src/db/schema.ts` with `projects`, `tables`, `columns`, `relationships`, `import_runs` (TEXT UUID ids, UTC ISO timestamps, review metadata columns) and verify `bun run db:generate` produces the migration
- [x] 1.2 Extend `apps/api/src/db/migration.test.ts` to assert every new table and foreign key exists after migrating a temp SQLite file and verify `bun test apps/api` passes

## 2. Port do parser (`packages/sql-parser`)

- [x] 2.1 Create `packages/sql-parser` and port `parseSQLToTables`, `splitSqlDefinitions`, identifier/FK helpers, `parseAlterTableForeignKeys`, `normalizeRelationships` from `legacy/app.js:147-452` to TypeScript and verify `bun run --cwd packages/sql-parser typecheck` passes
- [x] 2.2 Port the assertions of `legacy/tests/sql-import.test.js` to `packages/sql-parser/src/parser.test.ts` and verify `bun test packages/sql-parser` passes with all v1 cases

## 3. Port do diff (`packages/model-diff`)

- [x] 3.1 Create `packages/model-diff` and port `createUpdateWizardState`, `buildTableRows`, `buildTablePlans`, `buildColumnGroups`, `buildColumnRows`, `applyUpdateWizardState` from `legacy/app.js:538-819` to TypeScript and verify `bun run --cwd packages/model-diff typecheck` passes
- [x] 3.2 Port the assertions of `legacy/tests/update-model.test.js` to `packages/model-diff/src/diff.test.ts` and verify `bun test packages/model-diff` passes (metadata preservation cases included)

## 4. Persistence: ports, adapter e fronteiras

- [x] 4.1 Create `src/persistence/ports.ts` (project, model and import-run interfaces) + `src/persistence/context.ts` and verify `bun run --cwd apps/api typecheck` passes
- [x] 4.2 Implement `src/persistence/sqlite/adapter.ts` (Drizzle) and `src/persistence/runtime.ts` composition root with a test that persists and reloads a project in a temp database and verify `bun test apps/api` passes
- [x] 4.3 Create `scripts/check-persistence-boundaries.ts` (routes/services must not import `drizzle-orm` or `db/schema`), add it to `bun run check`, and verify it exits 0 on the clean tree and non-zero for a temporary violation introduced in a route (removed afterwards)

## 5. API `project-api`

- [x] 5.1 Add Zod + the error-envelope middleware (`{ error: { code, message, retryable, details } }`, sanitized) in `apps/api` and verify a test asserts the envelope on a validation failure
- [x] 5.2 Implement project CRUD routes (`POST/GET/PUT /api/projects[/{id}]`) on the persistence ports and verify integration tests cover create, list, get, save-replaces-with-normalized-children, and 404-with-envelope
- [x] 5.3 Implement the v1-contract export endpoint and verify a contract test asserts the exact v1 field set (README example shape, children derived) against a fixture
- [x] 5.4 Implement v1 JSON import with backfill and verify tests cover legacy-JSON import and atomic rejection of a payload without `database`

## 6. API `model-import`

- [x] 6.1 Implement parse + preview endpoint (non-mutating, explicit rename mappings only) and verify tests cover full-schema parse, no-CREATE-TABLE error, unsupported-DDL skipping, preview classification and preview-does-not-mutate
- [x] 6.2 Implement apply endpoint with server-side plan revalidation and verify tests cover kept/renamed metadata preservation, new-item defaults (`status: "NEW"`), type change (`status: "CHANGED"`), removals, relationships-from-new-SQL, and stale-plan rejection
- [x] 6.3 Implement `import_runs` recording and verify tests cover apply-creates-history and rejected-apply-creates-nothing

## 7. Documentação

- [x] 7.1 Document the v2 REST endpoints and the import flow in `README.md` (and `AGENTS.md` if new commands appeared) and verify every documented command runs as written

## 8. Gates

- [x] 8.1 Run `bun run check` and verify it exits 0 with all new suites included
- [x] 8.2 Verify `legacy/` is untouched: `git status legacy/` shows no changes and the five `node tests/*.test.js` still print `ok` from `legacy/`

## 9. Validate

- [x] 9.1 Run `openspec validate v2-phase1-domain-import --strict` and confirm it exits 0
- [x] 9.2 Run `bun run check` in `~/work/dbmapper/` one final time and confirm it exits 0

## 10. Archive

- [x] 10.1 Copy source only (never `node_modules` or build output) from `~/work/dbmapper/` to the share and commit with an imperative message
- [ ] 10.2 Mark Fase 1 as ✅ in `ROADMAP.md` and commit the roadmap update
- [ ] 10.3 Run `openspec archive v2-phase1-domain-import --yes` to move the change under `openspec/changes/archive/`

## Workflow follow-up

- Stop here and wait for Jairo's ok before starting Fase 2 (`ROADMAP.md` gate).
