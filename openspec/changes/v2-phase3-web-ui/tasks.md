# Tasks

## 1. Fundação do app web

- [ ] 1.1 Add the web dependencies (react-router, @tanstack/react-query, tailwindcss, @testing-library/react, happy-dom) and verify `bun install` + `bun run --cwd apps/web typecheck` pass
- [ ] 1.2 Create the typed API client (`src/api/`, `credentials: 'include'`, error-envelope parser) plus Tailwind tokens echoing the v1 palette and the router shell (`/login`, `/`) and verify a client unit test parses both success and envelope-error responses
- [ ] 1.3 Wire `bun run dev` (API :3000 via `PORT`, web :5173, Vite proxy `/api`) and verify both servers boot and the proxy reaches `/health`

## 2. Tela de login e sessão

- [ ] 2.1 Build the login form (PT-BR), call `POST /api/auth/login`, and verify component tests cover success redirect, generic failure message, and that no error distinguishes unknown email from wrong password
- [ ] 2.2 Add the session guard (`/api/auth/me` wrapper + logout control) and verify tests cover unauthenticated → `/login` and logout returns to `/login`

## 3. Workspace e árvore semântica

- [ ] 3.1 Build the workspace shell (project selector + "novo projeto", loads project via React Query) and verify a test renders a fetched project's name and tables
- [ ] 3.2 Build the semantic tree (tables → columns, badges `sem desc`/`revisar`/`aprovado`, collapse per table, expand/collapse all, active highlight) and verify tests cover badge states, collapse behavior, and selection events

## 4. Editor de metadados e revisão

- [ ] 4.1 Build the editor (description textarea with save, business-term chips add/remove via Enter, breadcrumb) and verify tests cover persistence call, chip add/remove, and empty-description state
- [ ] 4.2 Add the review workflow ("Aprovar Descrição"/"Reabrir Revisão": disabled while empty with the PT-BR message, auto-reopen on approved edit, invalidation updating badges) and verify tests cover the gate, the reopen-on-edit, and the approval mutation payload

## 5. Barra de cobertura

- [ ] 5.1 Port `computeStats` (`legacy/app.js:823-849`) to `apps/web` as a pure module, port `legacy/tests/coverage-stats.test.js` alongside it, and verify `bun test apps/web` passes all v1 coverage cases
- [ ] 5.2 Render the status bar (totals, described/reviewed counts and %, pending, progress) bound to the loaded model and verify a test recomputes after a description change

## 6. Wizard de atualização

- [ ] 6.1 Build the wizard flow (upload SQL → `preview` call → steps tabelas/colunas/relacionamentos/resumo from the plan, explicit rename selects, summary counters) and verify tests cover row classification rendering, rename selection, and that no apply happens before confirmation
- [ ] 6.2 Wire `apply` with confirmation (show result, invalidate project) and verify a test covers apply payload with renames, post-apply badge/metadata preservation rendering, and error display on stale plan

## 7. Criação por SQL e JSON

- [ ] 7.1 Build "novo projeto a partir de SQL" (file upload → create → tree populated, clear error on no-CREATE-TABLE) and verify tests cover success and the error path
- [ ] 7.2 Build export (download v1 JSON) and import (upload v1 JSON) and verify a round-trip test preserves descriptions, terms and review states

## 8. E2E smoke

- [ ] 8.1 Add `e2e/smoke.ts` (Playwright: boot API+web, seed admin, login, create project from `legacy/example.sql`, describe, approve, export) as `bun run test:e2e` with Playwright chromium installed in the work dir only, and verify the smoke passes end to end

## 9. Documentação

- [ ] 9.1 Document the web app (commands, first-login via seed, testing incl. `test:e2e`) in `README.md` and `AGENTS.md` and verify every documented command runs as written

## 10. Gates

- [ ] 10.1 Run `bun run check` and verify it exits 0 with the web suites included
- [ ] 10.2 Verify `legacy/` is untouched: `git status legacy/` shows no changes and the five `node tests/*.test.js` still print `ok` from `legacy/`

## 11. Validate

- [ ] 11.1 Run `openspec validate v2-phase3-web-ui --strict` and confirm it exits 0
- [ ] 11.2 Run `bun run check` in `~/work/dbmapper/` one final time and confirm it exits 0

## 12. Archive

- [ ] 12.1 Copy source only (never `node_modules`, `dist`, browsers or build output) from `~/work/dbmapper/` to the share and commit with an imperative message
- [ ] 12.2 Mark Fase 3 as ✅ in `ROADMAP.md` and commit the roadmap update
- [ ] 12.3 Run `openspec archive v2-phase3-web-ui --yes` to move the change under `openspec/changes/archive/` (including the promoted `web-editor` and `web-import-wizard` specs)

## Workflow follow-up

- Stop here and tell Jairo the software is testable in the browser (seed + `bun run dev` instructions) and wait for his ok before starting Fase 4.
