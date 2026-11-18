# Tasks — v2-phase5-mcp

## 1. Chaves — schema e persistência

- [x] 1.1 Add `api_keys` to `apps/api/src/db/schema.ts` (hash unique, prefix, project scope sem FK, expiry/revocation, `last_used_at`) and verify `bun run db:generate` produces an additive migration that applies cleanly via `bun run db:migrate` on fresh and existing DBs with `bun test` green.
- [x] 1.2 Extend the `Persistence` port + SQLite runtime with key repositories (create with SHA-256 hash + prefix, list by owner, revoke, hash lookup with revoked/expired checks, `last_used_at` update) and audit events for create/revoke; verify API tests cover hash-only storage, immediate revocation and events.

## 2. Rotas de chaves

- [x] 2.1 Implement `POST/GET/DELETE /api/keys` (session-only, `MEMBER`+, plaintext returned exactly once, list exposes only prefix/status/`last_used_at`, foreign key id → 404) and verify tests for every spec scenario of `api-keys` including VIEWER 403 and audit rows.

## 3. Credencial Bearer

- [x] 3.1 Implement `requireCredential` replacing the global session guard: Bearer path limited to the exported `KEY_ENABLED` set (project GET/export, agent routes, item description PATCH) with owner identity + role, `last_used_at`, 401 `INVALID_API_KEY`, project-scope 403 that does not leak existence, session-only routes rejecting keys, client-supplied identity ignored; verify unit tests pin the exact `KEY_ENABLED` list and every scenario of the `auth`/`api-keys` deltas passes.

## 4. Endpoint de descrição por item

- [x] 4.1 Implement `PATCH /api/projects/:id/items/:itemType/:itemId/description` with zod validation and the `setItemDescription` repository method (ownership check → 404, source `mcp`/`human` from credential, `reviewed=false` only on real change, event in the same transaction); verify tests for session write, key write reopening review, identical write keeping `reviewed`, 404 and VIEWER 403.

## 5. Catálogo MCP

- [x] 5.1 Build `apps/mcp/src/catalog.ts` as the single source (`TOOL_CATALOG`: 9 tools with description, JSON Schema, `docSection`, `dispatch`) rejecting identity arguments in schemas; verify unit tests assert exactly the nine names, schema structure and the forbidden-key rule.

## 6. Servidor stdio + adaptador REST

- [x] 6.1 Implement `apps/mcp/src/api.ts` (fetch client: env config, envelope → `ApiError`, no raw-body echo), `handlers.ts` (all nine tools: read tools filtering the model locally, `set_description` with the "não revisado" warning, suggestion cycle delegating to CAS, `get_export`) and `index.ts` (SDK server + stdio transport, `MCP_CONFIG_ERROR` path when env missing); verify tests with mocked fetch cover tool shapes, error mapping (401/403/409), local schema rejection before any fetch and the missing-env failure.

## 7. Guarda de catálogo

- [x] 7.1 Write `scripts/check-mcp-catalog.ts` (documented anchor, dispatch, structural schema, no identity args, no literal key in `opencode.json.example`) plus root script `test:mcp-catalog` wired into `bun run check`; verify the guard exits 0 on the tree and validator unit tests fail with the offending tool named on synthetic bad catalogs.

## 8. Config exemplo e gitignore

- [x] 8.1 Create `opencode.json.example` (stdio entry with `{env:DBMAPPER_*}`, remote entry disabled) and add `/opencode.json` to `.gitignore`; verify `git check-ignore opencode.json` matches and the example contains no literal key.

## 9. Documentação

- [x] 9.1 Write `docs/TOOLS-DBMAPPER.md` (all nine tools grouped, args and responses), the README MCP section (create key → env → connect opencode), client env vars in `.env.example` and an additive `## MCP (v2 — Fase 5)` section in `AGENTS.md`; verify every documented command runs as written and the catalog guard confirms doc coverage.

## 10. Skill

- [x] 10.1 Create `skills/dbmapper/SKILL.md` adapted from the azyboard skill (mandatory flow: discover project → list missing → analyze local codebase → write descriptions → report; security rules: key only in env, no parallel MCP calls, "não revisado" warning, `reviewed` human-only; error handling by code; references to the TOOLS doc); verify every tool name and argument it mentions matches `catalog.ts`.

## 11. Gates

- [x] 11.1 Run `bun run check` (now including `test:mcp-catalog`) and verify it exits 0.
- [x] 11.2 Verify `legacy/` is untouched (`git status legacy/` clean) and the five `node tests/*.test.js` still print `ok` from `legacy/`.

## 12. Ponta-a-ponta com opencode (orquestrador)

- [x] 12.1 With the API running locally (fake provider, temp DB), create a MEMBER user and an API key, configure a local gitignored `opencode.json`, run `opencode run` using the dbmapper MCP tools (`list_missing_descriptions` + `set_description`) and verify in the DB that the description landed with `description_source='mcp'`, `reviewed=false` and an audit event; attach the evidence to the final report.

## 13. Validate

- [x] 13.1 Run `openspec validate v2-phase5-mcp --strict` and confirm it exits 0.
- [x] 13.2 Run `bun run check` one final time and confirm it exits 0.

## 14. Archive

- [x] 14.1 Run the secrets check, commit with an imperative message and push to `origin` (GitHub é a fonte da verdade).
- [x] 14.2 Mark Fase 5 as ✅ in `ROADMAP.md` and commit.
- [x] 14.3 Run `openspec archive v2-phase5-mcp --yes` and stage the promoted specs if the archive commit comes out incomplete.
