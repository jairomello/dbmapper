# Tasks — v2-phase6-polish

## 1. Cobertura de eventos

- [x] 1.1 Build the mutating-route matrix (every `app.post|put|patch|delete`) and fill the gaps — pass `audit` for project create/save/JSON import/SQL apply and user create/role change using the design's `domain.verb` taxonomy (decide in this task whether an `events(created_at)` index migration is needed); verify a table-driven API test asserts each mutating route produces an event with actor + subject, and a failed/rolled-back mutation produces none.

## 2. API de auditoria

- [x] 2.1 Implement `GET /api/events` (ADMIN, zod filters: `action` prefix, `projectId`, `limit` default 100 max 500, newest-first with `actorEmail`) plus the `listEvents` port + SQLite implementation; verify tests cover admin ordering, MEMBER/VIEWER 403, unauthenticated 401, prefix filter, limit default/cap.

## 3. UI de auditoria

- [x] 3.1 Create the `/audit` route with a `RequireAdmin` guard (role from `GET /api/auth/me`), the AuditPage table (ator, ação, assunto, quando), the action-family filter mapped to the prefix query and a PT-BR empty state; verify component tests render entries, apply the filter, show the empty state and redirect non-admins.

## 4. Rota viewer

- [x] 4.1 Create `/viewer/:id` (inside `RequireSession`, outside `RequireProject`) with `ViewerPage` fetching the export payload: client-side search, `SemanticTree` + `StatusBar` reuse, read-only `ViewerDetail` with source/review badges, loading/404-friendly/empty states; verify component tests assert data rendering, absence of mutation controls and that every fetch issued is GET.

## 5. Entry points do viewer

- [x] 5.1 Add the "Somente leitura" link on gallery cards and a viewer link in the workspace header; verify tests cover navigation landing on `/viewer/:id` for the right project.

## 6. E2E

- [x] 6.1 Extend `e2e/smoke.ts` with the viewer step (open `/viewer/:id`, assert the tree renders and no mutating control exists, assert only GET requests from that page) and verify `bun run test:e2e` passes.

## 7. Artefatos de deploy

- [x] 7.1 Create `docker/Dockerfile.api`, `docker/Dockerfile.web` (nginx + `/api` proxy), `docker/docker-compose.yml` (SQLite volume, env-driven secrets, ports), `docker/entrypoint-api.sh` (migrate + optional seed) and `docker/.dockerignore`, adapted from the azyboard patterns without copying secrets or machine paths; verify `python3 -c 'yaml.safe_load'` parses the compose file, every referenced script/path exists, and no secret literal appears (note: `docker build` runs only in the deploy environment — this VM has no Docker).

## 8. Documentação de deploy

- [x] 8.1 Write `docs/DEPLOY.md` (notebook → labapps → Vultr `jairo.tools`, production checklist: strong `JWT_SECRET`, `NODE_ENV=production`, SQLite volume backup, TLS/ports, rollback) plus the README deploy section and an additive `## Deploy (v2 — Fase 6)` AGENTS.md section; verify every documented command and path exists.

## 9. Gates

- [x] 9.1 Run `bun run check` and verify it exits 0.
- [x] 9.2 Verify `legacy/` is untouched (`git status legacy/` clean) and the five `node tests/*.test.js` still print `ok` from `legacy/`.

## 10. Validate

- [x] 10.1 Run `openspec validate v2-phase6-polish --strict` and confirm it exits 0.
- [x] 10.2 Run `bun run check` one final time and confirm it exits 0.

## 11. Archive

- [x] 11.1 Run the secrets check, commit with an imperative message and push to `origin` (GitHub é a fonte da verdade).
- [x] 11.2 Mark Fase 6 as ✅ in `ROADMAP.md` and commit.
- [x] 11.3 Run `openspec archive v2-phase6-polish --yes` and stage the promoted specs if the archive commit comes out incomplete.
