# Design — v2-phase0-scaffold

## Context

The repo holds the frozen v1 static app (`legacy/`) and an approved v2 direction (see `proposal.md` — Why; full rationale in `docs/analysis/03-proposta-evolucao-v2.md`). Phase 0 must produce the workspace where phases 1–6 land code, without writing feature behavior yet. Constraints: work runs outside the share (`~/work/dbmapper/`), so the repo receives source only — never `node_modules` or build output; the Azy Board codebase is the approved reference architecture (§8 decisions).

## Goals / Non-Goals

**Goals:** runnable Bun workspace; one command that proves quality (`bun run check`); working SQLite migration pipeline; conventions (Biome, TS strict) locked in before feature code exists.

**Non-Goals:** schema completo, endpoints, UI, auth, MCP, boundary-check scripts de rotas (chegam na fase 1, quando houver rotas/serviços para verificar).

## Decisions

1. **Monorepo shape `apps/{api,web,mcp}` + `packages/`** — mirrors the Azy Board layout that already proved out (analysis 02 §1); phases 1–6 map 1:1 onto it. *Alternative:* single package — rejected: no isolation for the MCP adapter or shared packages, and it diverges from the reference architecture.
2. **Bun workspaces + `bun.lock` + `.bun-version`** — runtime, package manager and test runner in one (same as azyboard). *Alternative:* npm/pnpm — rejected: no benefit; azyboard tooling assumes Bun (`bun test`, `bun run --cwd`).
3. **Drizzle ORM, SQLite dialect, explicit `bun run db:migrate`** — approved decision §8.5; migration runner is CLI-invoked, never at API startup (azyboard pattern). PostgreSQL later plugs in behind the ports/composition-root boundary introduced in phase 1 — phase 0 does not create the PG mirror.
4. **Biome instead of ESLint+Prettier** — one tool, one config, proven in azyboard (`biome.json`); TS strict via `tsconfig.base.json`.
5. **First migration creates a minimal `projects` table** (`id`, `name`, `created_at`) — proves generate→migrate→verify end to end and gives phase 1 its natural anchor. The full schema belongs to phase 1.
6. **Gates now = `typecheck + lint + bun test`**; the boundary scripts (`check:persistence`, `check:api-boundary`) are copied from azyboard in phase 1, when there are `routes/`/`services/`/`packages/` for them to police.
7. **Smoke test** (`bun test`): workspace boots, migration applies to a temp SQLite file, a trivial assertion passes — the "toolchain works" contract for every later phase.

## Risks / Trade-offs

- [Toolchain conflicts with the historical static-site rule] → conflict named in `proposal.md`; rule scoped to `legacy/` in `AGENTS.md`, approval recorded (14/11/2026).
- [Phase 0 is thin by design — risk of "scaffold sprawl"] → scope capped at the six decisions above; anything not needed by phase 1 is deferred.
- [Drizzle schema churn in phase 1] → phase 0 migration stays minimal (`projects` only); full schema is generated and reviewed inside phase 1's change.
- [No node_modules in the share] → all install/test runs happen in `~/work/dbmapper/`; only source files land here (skill `trabalhar-projetos`, rule 2).

## Migration Plan

Documentation/config-only change plus workspace scaffolding — no production system exists yet. Steps: (1) implement in `~/work/dbmapper/`, (2) run `bun run check` green there, (3) copy source (no `node_modules`) to the share, (4) commit. Rollback: revert the commit — `legacy/` is untouched and remains the working v1; the disposable `dev.db`/test databases are regenerated with `bun run db:migrate`. Deploy: not applicable in phase 0 (deployment path notebook → labapps → Vultr starts in phase 6).
