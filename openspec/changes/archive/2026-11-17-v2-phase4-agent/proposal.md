# Proposal

## Why

Fases 0–3 delivered the usable v2 without AI: descriptions are still written by hand, one field at a time — the exact pain that motivated the v2. This phase introduces the embedded agent: batch LLM-generated description suggestions queued for human approval, with a full audit trail.

## What Changes

- **LLM provider layer**: a simplified `ModelProvider` interface (plain text/JSON completion) with OpenAI and OpenRouter implementations configured via env (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, model ids), injected through the composition root; tests use an in-memory fake provider — no real LLM calls in the test suite.
- **Suggestion generation jobs**: `POST /api/projects/:id/agent/suggestions` (scope: project or table; targets items without description) creates an `agent_jobs` row processed by an in-process worker with a lease. The pipeline collects context (table, columns, types, PK/FK, neighbouring descriptions), calls the LLM in per-table batches, and writes rows into `ai_suggestions` with status `pending` — one pending suggestion per item (regeneration replaces it).
- **Approval queue UI**: a "Sugestões IA" panel in the workspace listing pending suggestions with side-by-side preview (column context × suggestion), job progress, and actions **aplicar / editar / rejeitar**, individually and in bulk.
- **Apply semantics**: applying fills `description`, sets `description_source='agent'` and `reviewed=false` — the agent never sets `reviewed=true`; applying over an approved item reopens its review (existing v1 rule).
- **Audit**: an `events` table records who requested generation, applied, edited or rejected suggestions, with timestamps.

## Capabilities

### New Capabilities

- `agent-suggestions`: the embedded agent's batch suggestion lifecycle — provider configuration, generation jobs, the pending queue, apply/edit/reject with CAS, permissions, and audit events.

### Modified Capabilities

_None._ — the apply/edit/reject flows live in the new panel, not in the editor; the editor's human-edit requirements are unchanged.

## Impact

- **API**: new tables (`agent_jobs`, `ai_suggestions`, `events`) + migration; new routes under `/api/projects/:id/agent/*`; new repositories in the `Persistence` port; provider service injected via `createApp` options.
- **Web**: new suggestion panel component + React Query hooks + API client methods; workspace gains the panel entry point.
- **Docs**: `.env.example`, `README.md`, `AGENTS.md` gain the LLM env vars and the generation flow.
- **`legacy/` untouched**; no new runtime dependencies beyond the `openai` SDK (OpenAI-compatible, used for both providers).

## Non-goals

- MCP tools, API keys and the opencode skill (Fase 5); conversational chat agent; SSE (UI polls job status); generation scoped to a hand-picked selection of items; suggestions for items that already have a description; suggestions for relationship descriptions; provider admin UI (env-only config); cost/token accounting.
