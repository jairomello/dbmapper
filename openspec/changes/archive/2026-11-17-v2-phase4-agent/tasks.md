# Tasks — v2-phase4-agent

## 1. Schema, migração e repositórios

- [x] 1.1 Add `agent_jobs`, `ai_suggestions` and `events` tables to `apps/api/src/db/schema.ts` (text enums + checks, indexes, one-pending-per-item invariant via partial unique index or transactional-replace design note) and verify `bun run db:generate` produces a migration that applies cleanly via `bun run db:migrate` on a fresh DB, with `bun test` still green.
- [x] 1.2 Extend the `Persistence` port and SQLite runtime with job, suggestion and event repositories (insert/get/list, conditional-CAS updates, job claim with lease; events insert+list only) and verify API tests cover insert/list, CAS transition semantics and append-only events.

## 2. Provider LLM

- [x] 2.1 Implement the simplified `ModelProvider` interface with OpenAI and OpenRouter adapters (`openai` SDK, env-driven baseURL/model/key, timeout, safe error mapping that never echoes secrets) plus the in-memory fake provider, wired through `createApp` options, and verify unit tests: empty env → `LLM_NOT_CONFIGURED` path, adapter config from env, fake selectable via `DBMAPPER_LLM_PROVIDER=fake`, zero network calls in tests.

## 3. Contexto, prompt e parser

- [x] 3.1 Build the context collector (project/table scope → target tables and columns with empty descriptions, types, PK/FK flags, described neighbours, FK targets) and the PT-BR system prompt with the strict-JSON contract, and verify unit tests for scope filtering (only empty descriptions are targeted) and context shape.
- [x] 3.2 Implement the tolerant response parser (code-fence stripping, balanced-JSON extraction, zod validation, exact-name mapping, skip-invalid accounting) and verify unit tests with valid, malformed, partial and empty responses.

## 4. Worker e jobs

- [x] 4.1 Implement the in-process worker (unref'd interval loop, conditional claim with lease + attempts, heartbeat, per-table provider batches, transactional replace of pending rows, `succeeded`/`failed` transitions with `stats_json`) and verify API tests: successful run, provider failure mid-run keeps written suggestions and fails the job, expired lease is reclaimed with incremented attempts, regeneration replaces the pending suggestion for the same item.

## 5. Rotas e auditoria

- [x] 5.1 Register the agent routes (POST generate, GET job, GET pending list, PATCH edit, POST apply/reject single and bulk) with role gating and verify tests for every endpoint: 401 unauthenticated, 403 VIEWER, 202 generate, 409 CAS conflicts on stale apply/edit/reject, bulk response with `applied` + `skipped`, `LLM_NOT_CONFIGURED` when no provider.
- [x] 5.2 Record audit events for generate/apply/edit/reject inside the mutation transaction and verify tests assert an `events` row with actor and payload for each action, and that apply never leaves `reviewed=true` (approved target reopens to `false`).

## 6. UI — client e hooks

- [x] 6.1 Add the agent API client and React Query hooks (pending list, job query with `refetchInterval` while `queued|running`, generate/apply/reject/edit mutations with cache invalidation) and verify component tests with mocked fetch cover loading, empty and error states plus the polling transition.

## 7. UI — painel Sugestões IA

- [x] 7.1 Build `SuggestionPanel` (pending rows with side-by-side preview of context × suggested text, empty state, job progress banner) and verify component tests for list rendering, preview content and progress refresh.
- [x] 7.2 Add selection checkboxes with bulk Aplicar/Rejeitar, inline edit-before-apply, the "Sugerir descrições" entry with scope dialog (projeto inteiro / esta tabela), pending-count badge and VIEWER-hidden actions in the workspace, and verify component tests cover bulk actions, edit-then-apply, entry flow and role visibility.

## 8. E2E

- [x] 8.1 Extend `e2e/smoke.ts` with the agent flow under `DBMAPPER_LLM_PROVIDER=fake` (generate → wait for job → apply one suggestion → approve item → coverage reflects it) and verify `bun run test:e2e` passes.

## 9. Documentação

- [x] 9.1 Document the LLM env vars in `.env.example`, the generation flow and roles in `README.md`, and the new behavior/commands in `AGENTS.md`, and verify every documented command runs as written.

## 10. Gates

- [x] 10.1 Run `bun run check` and verify it exits 0.
- [x] 10.2 Verify `legacy/` is untouched (`git status legacy/` clean) and the five `node tests/*.test.js` still print `ok` from `legacy/`.

## 11. Validate

- [x] 11.1 Run `openspec validate v2-phase4-agent --strict` and confirm it exits 0.
- [x] 11.2 Run `bun run check` one final time and confirm it exits 0.

## 12. Archive

- [x] 12.1 Run the secrets check, commit with an imperative message and push to `origin` (GitHub é a fonte da verdade).
- [x] 12.2 Mark Fase 4 as ✅ in `ROADMAP.md` and commit.
- [x] 12.3 Run `openspec archive v2-phase4-agent --yes` and stage the promoted `agent-suggestions` spec if the archive commit comes out incomplete.
