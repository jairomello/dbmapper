# Tasks

## 1. Workspace skeleton

- [x] 1.1 In `~/work/dbmapper/` (working copy outside the share), create the root `package.json` with Bun workspaces `apps/*` and `packages/*` and verify `bun install` resolves the workspace without errors
- [x] 1.2 Create `.bun-version` and `tsconfig.base.json` (TypeScript strict, bundler resolution) and verify `bun --version` matches `.bun-version`
- [x] 1.3 Create `biome.json` (lint + format, matching the Azy Board rules) and verify `bunx biome check .` runs and reports on the scaffold files

## 2. Apps and packages placeholders

- [x] 2.1 Create `apps/api` with `package.json`, `src/index.ts` minimal Hono entry exposing `GET /health` and verify it typechecks via `bun run --cwd apps/api typecheck`
- [x] 2.2 Create `apps/web` (Vite + React placeholder page) and `apps/mcp` (stdio adapter placeholder entry) with their `package.json` and verify both typecheck via their `typecheck` scripts
- [x] 2.3 Create `packages/domain` and `packages/contracts` as pure type packages and verify `bun run --cwd packages/domain typecheck` passes

## 3. Drizzle + first migration

- [x] 3.1 Add `drizzle-orm` and `drizzle-kit` to `apps/api`, create `drizzle.config.ts` (sqlite dialect, output `src/db/migrations`) and verify `bun run db:generate` runs
- [x] 3.2 Define the minimal `projects` table schema (`id`, `name`, `created_at`) and generate the first migration; verify the `.sql` file lands in `apps/api/src/db/migrations/`
- [x] 3.3 Create the migration runner (`bun run db:migrate`) and a test that applies migrations to a temp SQLite file and asserts the `projects` table exists; verify `bun test` passes in `apps/api`

## 4. Documentation of the scaffold

- [x] 4.1 Update the "Estrutura do repositório" section of `README.md` to describe the real `apps/`/`packages/` layout and verify every path listed exists
- [x] 4.2 Update `AGENTS.md` with the v2 commands (`bun install`, `bun run dev`, `bun run check`, `bun run db:migrate`) and verify each command is runnable as written from the repo root

## 5. Gates and smoke

- [x] 5.1 Add root scripts `typecheck`, `lint`, `test` and `check` (typecheck → lint → test) and verify `bun run check` exits 0 in `~/work/dbmapper/`
- [x] 5.2 Add a workspace smoke test (`bun test` at root) asserting the API entry boots and the migration test is discovered; verify the full `bun test` run passes
- [x] 5.3 Verify `legacy/` is untouched: `git status legacy/` shows no changes and `cd legacy && node tests/sql-import.test.js` (and the other four) still print `ok`

## 6. Validate

- [x] 6.1 Run `openspec validate v2-phase0-scaffold --strict` and confirm it exits 0
- [x] 6.2 Run `bun run check` in `~/work/dbmapper/` one final time and confirm it exits 0

## 7. Archive

- [x] 7.1 Copy source only (never `node_modules` or build output) from `~/work/dbmapper/` to the share and commit with an imperative message
- [ ] 7.2 Mark Fase 0 as ✅ in `ROADMAP.md` and commit the roadmap update
- [ ] 7.3 Run `openspec archive v2-phase0-scaffold --yes` to move the change under `openspec/changes/archive/`

## Workflow follow-up

- Stop here and wait for Jairo's ok before starting Fase 1 (`ROADMAP.md` gate).
