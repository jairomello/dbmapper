# Design — v2-phase4-agent

## Context

The v2 API is Hono + Drizzle + `bun:sqlite` behind a `Persistence` port (`apps/api/src/persistence/ports.ts` + `sqlite/` runtime) with routes registered in `createApp` (`apps/api/src/app.ts`). The web app is React + Vite + React Query, workspace under `/project/:id`. Auth is cookie-session with global `/api/*` guard and `ADMIN/MEMBER/VIEWER` roles.

Reference material from Azy Board (approved for reuse, doc 02 §6/§9): `openaiProvider.ts` (137 l., OpenAI-compatible SDK wrapper) and `assistantHarness.ts` (836 l., approval preview + `operationHash` + CAS + lease). Phase 4 needs only a slice of that: a batch-completion provider and a CAS'd queue — not the conversational harness, tool registry, WebSocket/outbox or tenants.

Two facts that shape the design:

- **The raw SQL is not persisted in v2** (only the parsed model; `import_runs.plan_snapshot` holds the diff plan). The proposal's "SQL de origem" context is therefore unavailable server-side — the context is the semantic model itself (tables, columns, types, PK/FK, neighbouring descriptions).
- **Single-instance deployment** (dev server; later one Docker container on labapps) — an in-process worker is enough; no external queue.

## Goals / Non-Goals

**Goals:**

- End-to-end batch suggestions: request → job → pending queue → human preview/edit/apply/reject → audit.
- Concurrency-safe decisions (CAS) and exactly one pending suggestion per item.
- Fully testable without network: fake provider injected in tests and e2e.
- Env-only key configuration; nothing secret in DB, code or responses.

**Non-Goals:** MCP tools/API keys (Fase 5), chat agent, SSE, per-item selection scope, relationship suggestions, cost accounting, provider admin UI.

## Decisions

### 1. Schema — three new tables

```ts
agent_jobs: id, project_id (FK cascade), scope ('project'|'table'), table_id (FK, nullable),
  status ('queued'|'running'|'succeeded'|'failed'), attempts int default 0,
  lease_expires_at (text, nullable), requested_by (FK users), error (text, nullable),
  stats_json (text default '{}'), created_at, updated_at
  // indexes: (project_id, created_at), (status)

ai_suggestions: id, project_id (FK), job_id (FK), item_type ('table'|'column'), item_id,
  table_id (FK, nullable — grouping/context), suggested_description, context_json,
  status ('pending'|'applied'|'rejected'), requested_by (FK), decided_by (FK, nullable),
  decided_at, created_at, updated_at
  // partial unique (item_type, item_id) WHERE status='pending' — one pending per item
  // index: (project_id, status)

events: id, project_id (FK), actor_user_id (FK users, nullable), action, subject_type,
  subject_id, payload_json, created_at
  // index: (project_id, created_at); insert + list only (append-only, spec requirement)
```

Enums use `text` + `check` (project pattern). If Drizzle cannot express the partial unique index, fall back to a transactional replace (delete pending + insert in one tx) — the spec's "at most one pending per item" holds either way; the implementer verifies which path `drizzle-orm` supports before choosing.

### 2. Provider layer — simplified `ModelProvider`

```ts
interface ModelProvider {
  readonly name: string
  complete(input: { prompt: string; system: string; signal?: AbortSignal }): Promise<string>
}
```

- **No tools/streaming/cancellation** (azyboard's `ModelProvider` is overkill for a single batch-completion use case).
- `OpenAIProvider` and `OpenRouterProvider` built on the `openai` SDK (OpenAI-compatible; OpenRouter via `baseURL: https://openrouter.ai/api/v1`), timeout ~60 s, small retry count, errors mapped to safe messages (never echo the key).
- **Factory reads env once at composition root**: `DBMAPPER_LLM_PROVIDER = 'openai' | 'openrouter' | 'fake'` plus the corresponding `*_API_KEY`/`*_MODEL`. No provider (or missing key) → every generate request fails `LLM_NOT_CONFIGURED` (spec). `fake` is the in-memory test/e2e provider — documented as test-only; it emits deterministic PT-BR suggestions from the context without network.
- Injected via `createApp(persistence, { agent })`; production `index.ts` builds it from env, tests pass the fake directly.

### 3. Worker — in-process loop with lease (adapted from azyboard `agentJobQueue`/`agentWorker`, single-process)

- On `createApp`, start an unref'd interval (~1 s) that claims at most one job: conditional `UPDATE ... SET status='running', lease_expires_at = now+60s, attempts = attempts+1 WHERE id = (SELECT id FROM agent_jobs WHERE status='queued' OR (status='running' AND lease_expires_at < now) ORDER BY created_at LIMIT 1) RETURNING *` — the expired-lease branch gives the spec's reclaim behavior after a crash/restart.
- While processing, a heartbeat extends the lease; on finish → `succeeded`/`failed` (+ `error`, `stats_json`).
- Processing: resolve targets → group by table → per-table context → one provider call per table → tolerant parse → transactional insert replacing pending rows for those items.
- **Alternative rejected:** synchronous generation inside the request (simpler, no lease) — LLM batches routinely exceed comfortable HTTP timeouts, and the spec requires lease reclaim. **SSE rejected:** proposal allows "refetch na UI"; 2 s polling while a job is active is enough for a batch UI.

### 4. Prompt and parser

- **System prompt (PT-BR):** instructs a strict JSON answer `{"suggestions":[{"item":"<name>","description":"<pt-br>"}]}`, one entry per undescribed column/table, factual, no invented columns; dictionary metadata only in the payload (no secrets exist there).
- **Context per table:** table row (name, current description, business terms) + each target column (name, type, PK/FK flags) + descriptions of already-described columns in the same table + FK target table names.
- **Tolerant parser:** strip code fences, extract the first balanced JSON object, validate entries with zod, map `item` by exact name (case-sensitive), drop unknown/invalid entries, count them into `stats_json.skipped`. Items the model skipped simply get no suggestion — the job still succeeds (spec: zero-suggestion success path).

### 5. API surface

All under `/api/projects/:projectId/agent`, behind the global session guard, error envelope on every failure:

| Method | Path | Roles | Behavior |
|---|---|---|---|
| POST | `/suggestions` | MEMBER+ | `{scope:'project'\|'table', tableId?}` → 202 + job (`queued`); 403 VIEWER; `LLM_NOT_CONFIGURED` when no provider |
| GET | `/jobs/:jobId` | any | job status + stats (progress) |
| GET | `/suggestions?status=pending` | any | pending list with `context_json` |
| PATCH | `/suggestions/:id` | MEMBER+ | edit text, CAS `pending` (else 409) |
| POST | `/suggestions/:id/apply` \| `/reject` | MEMBER+ | single CAS (else 409) |
| POST | `/suggestions/apply` \| `/reject` | MEMBER+ | bulk: per-id CAS; response reports `applied/rejected` + `skipped` (stale ids) |

Apply writes `description = suggested (or edited) text`, `description_source='agent'`, `reviewed=false` (NEVER `true`; approved target → review reopens, v1 rule preserved) and sets `decided_by`/`decided_at` on the suggestion.

### 6. Audit

`recordEvent(...)` runs in the same transaction as the mutation: actions `agent.generate_requested` (scope, targets count), `agent.suggestions_applied` / `agent.suggestions_edited` / `agent.suggestions_rejected` (suggestion ids, item ids). Repository exposes `insert` + `list` only.

### 7. Web UI

- `apps/web/src/agent/`: typed API client + React Query hooks — `usePendingSuggestions`, `useAgentJob(jobId)` with `refetchInterval` while `queued|running`, `useGenerateSuggestions`, `useApplySuggestions`, `useRejectSuggestions`, `useEditSuggestion` (invalidations after every mutation).
- `SuggestionPanel` in the workspace (drawer/section): pending rows with side-by-side preview (item path + context × suggested text), checkbox selection with bulk bar (Aplicar/Rejeitar), inline edit before apply, job progress banner, empty state; PT-BR toasts.
- Entry point: "Sugerir descrições" action in the workspace with a scope dialog (projeto inteiro / esta tabela); badge with pending count. Actions hidden for `VIEWER`.

### 8. Testing strategy

- **Unit:** context builder (scope filters only empty descriptions), parser (valid/malformed/partial), provider factory (empty env → not-configured; fake selected via env).
- **API (temp SQLite + injected fake):** every endpoint's role gating, CAS 409s, successful run, mid-run failure keeps partial rows, lease reclaim, regeneration replaces pending, events rows per action, `reviewed` never `true` after apply.
- **Web component (mocked fetch):** list/preview, bulk actions, edit-then-apply, progress polling, VIEWER visibility, empty state.
- **E2E:** smoke extended with `DBMAPPER_LLM_PROVIDER=fake` — generate → job succeeds → apply → approve → badge updates.
- No test may hit the network.

## Risks / Trade-offs

- **In-process worker = single instance.** Acceptable for dev + single-container deploy; documented in README. Multi-instance would need an external queue (Fase 6+ concern).
- **LLM answer quality / malformed JSON.** Mitigated by strict prompt + tolerant parser + `skipped` stats surfaced in job payload; invalid output degrades to fewer suggestions, never to a failed dictionary.
- **SQLite single writer.** CAS via conditional UPDATE is safe; bulk operations are per-item CAS inside short transactions.
- **Drizzle partial-index support unverified.** Fallback (transactional replace) preserves the spec invariant; decide at implementation time.
- **Polling vs SSE.** 2 s latency on progress is invisible for a batch flow; SSE deferred.

## Migration Plan

1. Add the three tables to `apps/api/src/db/schema.ts`; run `bun run db:generate` → new migration file (additive only: 3 tables + indexes, no backfill, no column changes).
2. `bun run db:migrate` on a fresh DB and on an existing dev DB — both must succeed; old code keeps working against the new schema (additive).
3. Deploy order: migrate first, then the new API/web build (labapps container runs `db:migrate` on start, per existing setup).
4. Rollback: stop the app, drop the three tables (`DROP TABLE events; DROP TABLE ai_suggestions; DROP TABLE agent_jobs;`) — no data outside the agent feature is affected; code reverts with the previous release.
5. Docs: `.env.example` gains the provider vars; README documents the flow and the test-only `fake` provider; AGENTS.md notes the new commands/behavior if any.
