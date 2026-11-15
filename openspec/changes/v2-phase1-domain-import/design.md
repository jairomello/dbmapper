# Design — v2-phase1-domain-import

## Context

Phase 0 delivered the Bun workspace (`apps/api` with `/health`, Drizzle runner, minimal `projects` migration, `bun run check` gates). This change adds the dictionary domain on top of it. The v1 functional core to port lives in `legacy/app.js`: parser (lines 147–452) and wizard diff (538–819), both already covered by executable contracts in `legacy/tests/`. The export format is a hard contract (see `proposal.md` — Why).

## Goals / Non-Goals

**Goals:** complete dictionary schema; parser + diff as pure tested packages; REST API for project CRUD, v1-compatible export/import, and SQL import preview/apply with metadata preservation; boundary-enforced persistence layer.

**Non-Goals:** auth/users (Fase 2), UI (Fase 3), agent/MCP (Fases 4–5), coverage stats and DBViewer route (Fase 6), PostgreSQL adapter, filename-suggestion helpers, WebSocket.

## Decisions

1. **Port as pure packages, not a reuse of `legacy/app.js`.** `packages/sql-parser` and `packages/model-diff` re-implement the ported functions in TypeScript with the v1 tests ported assertion-for-assertion to `bun test`. *Alternative:* import `legacy/app.js` from the API — rejected: frozen browser code with global/DOM coupling and mixed module systems; the port must be free to become the single source of truth.
2. **Dictionary-complete schema now; entity tables with their phases.** Fase 1 owns `projects`, `tables`, `columns`, `relationships`, `import_runs` plus per-item review metadata (`description`, `business_terms` as JSON text, `reviewed`, `reviewed_by/at` nullable until Fase 2, `description_source` default `'human'`). `users`, `api_keys`, `ai_suggestions`, `events` arrive with Fases 2/4/5 via their own migrations — no speculative tables. *Alternative:* create all §4 tables upfront — rejected: unused tables churn without tests.
3. **Slim ports + composition root (approved architecture).** `src/persistence/ports.ts` (interfaces per aggregate), `src/persistence/sqlite/adapter.ts` (only module importing Drizzle), `src/persistence/runtime.ts` (composition root). Routes/services import ports only — enforced by `scripts/check-persistence-boundaries.ts` added to `bun run check` (the azyboard pattern, per Fase 0 design). *Alternative:* direct Drizzle in services — rejected: breaks the approved PG-ready boundary.
4. **IDs are application-generated TEXT (UUID); timestamps TEXT UTC ISO** (azyboard convention) — identical semantics on SQLite today and PostgreSQL later, no AUTOINCREMENT divergence.
5. **Export is a pure mapper** `model → v1 JSON` with `children` derived from `parents` via the ported `normalizeRelationships`; guarded by a contract test asserting the exact v1 field set against a fixture shaped like the README example.
6. **Preview returns a serializable plan; apply re-validates it server-side** against the current model (stale plan → error envelope, nothing written) — makes "rejected apply creates nothing" enforceable and keeps preview fully non-mutating.
7. **Integration tests use a temp SQLite file per test** (never `dev.db`), Hono `app.request()` style — the azyboard in-memory discipline.
8. **Validation with Zod** (strict schemas) in `apps/api`, mirroring azyboard's `parseJson` pattern; errors mapped to the envelope by one middleware.

## Risks / Trade-offs

- [Parser port diverges subtly from v1] → port the v1 test files first and keep every assertion; legacy tests remain runnable as cross-check.
- [Contract drift on export] → contract test against the v1-shaped fixture; any field addition breaks CI.
- [Slim ports under-abstract for PG] → interfaces are per-aggregate and small; extending is additive, not a rewrite.
- [`business_terms` as JSON text limits querying] → acceptable now (read-whole-item access); revisit only if filtering by term becomes a requirement.
- [Stale preview applied after concurrent edits] → server-side plan revalidation (Decision 6).

## Migration Plan

Documentation/config plus schema evolution — no production database exists yet. Steps: (1) implement and verify in `~/work/dbmapper/` (`bun run check` green), (2) copy source only to the share, (3) commit; the migration applies via `bun run db:migrate`. Rollback: revert the commit — migrations are forward-only and the local `dev.db` is disposable (delete + re-migrate); `legacy/` remains the working v1 throughout. Deploy: not applicable (notebook → labapps → Vultr starts in Fase 6).
