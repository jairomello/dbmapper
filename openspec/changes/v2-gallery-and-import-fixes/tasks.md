# Tasks

## 1. Galeria de projetos

- [ ] 1.1 Reshape the routes (`/` gallery, `/project/:id` workspace) with a `RequireProject` guard and verify component tests cover: login lands on gallery, card click opens `/project/:id`, refresh keeps the project, unauthenticated still goes to login
- [ ] 1.2 Build the gallery UI (cards with name, description, updated timestamp; empty state with CTA; "Novo projeto" action) using `GET /api/projects` — add `updated_at` to the list payload if absent — and verify tests cover populated and empty states

## 2. Import de JSON legado (bug b)

- [ ] 2.1 Read `legacy/app.js` (`downloadProjectJSON`, `handleJSONUpload` backfill) and build a faithful v1 export fixture under the test suite, including fields v2 does not model
- [ ] 2.2 Replace the strict document schema with strip-unknown + backfill semantics (only a missing `database` rejects; bad enums fall back to `UNCHANGED`) and verify: the v1 fixture imports with descriptions/terms/review preserved, an unknown-field payload imports, a payload without `database` still fails atomically with the envelope
- [ ] 2.3 Verify the existing export still round-trips (`bun test` green for the full import/export suites)

## 3. Import de arquivo proeminente (item c)

- [ ] 3.1 Create the shared `FileImportButton` (styled action/drop area, `accept=".sql,.json"`, `file.text()` read) and wire it into the gallery "Novo projeto" flow and the workspace new-project flow, replacing bare native inputs, and verify tests cover selecting a `.sql` file creating the project and the error path (no CREATE TABLE)
- [ ] 3.2 Wire it into the update wizard's upload step and verify a test covers selecting a large `.sql` file (fixture of several MB) completing preview without truncation; check and, if necessary, raise the server body limit — documenting the effective limit in README

## 4. E2E atualizado

- [ ] 4.1 Update `e2e/smoke.ts` for the new routes (login → gallery → novo projeto via arquivo `.sql` → workspace → descrição → aprovação → export) and verify `bun run test:e2e` passes

## 5. Documentação

- [ ] 5.1 Document the gallery flow, both file imports and the JSON legacy compatibility in `README.md` (and `AGENTS.md` if commands changed) and verify every documented command runs as written

## 6. Gates

- [ ] 6.1 Run `bun run check` and verify it exits 0
- [ ] 6.2 Verify `legacy/` is untouched: `git status legacy/` shows no changes and the five `node tests/*.test.js` still print `ok` from `legacy/`

## 7. Validate

- [ ] 7.1 Run `openspec validate v2-gallery-and-import-fixes --strict` and confirm it exits 0
- [ ] 7.2 Run `bun run check` in `~/work/dbmapper/` one final time and confirm it exits 0

## 8. Archive

- [ ] 8.1 Commit with an imperative message (repo now lives on GitHub — push to `origin` if access is configured, otherwise note it for the push queue)
- [ ] 8.2 Mark the fix round as ✅ in `ROADMAP.md` (new row "3.5 — Ajustes pós-teste") and commit
- [ ] 8.3 Run `openspec archive v2-gallery-and-import-fixes --yes` to move the change under `openspec/changes/archive/` (including the promoted `project-gallery` spec and the modified `web-editor`/`web-import-wizard` specs)

## Workflow follow-up

- Report the three fixes to Jairo and wait for his ok before starting Fase 4.
