# Proposal

## Why

Phase 3 of `ROADMAP.md` makes the product testable by a human: everything built so far (domain, import, auth) is backend-only. This change delivers the React UI — login, project workspace, semantic tree, metadata editor, coverage status bar and the update wizard — using the v1 capabilities as acceptance criteria, so Jairo can finally open the browser and work with the dictionary.

## What Changes

- `apps/web` becomes a real application: login screen (session via `/api/auth/*`), project workspace with creation/selection, and authenticated API access (cookie `credentials: 'include'`).
- **Semantic tree**: tables/columns with status badges (`sem desc` / `revisar` / `aprovado`), collapse/expand, active selection — the v1 `schema-tree` behavior.
- **Metadata editor**: description textarea, business-term chips, "Aprovar Descrição"/"Reabrir Revisão" with the non-empty gate and auto-reopen on edit — the v1 `semantic-editor` behavior, with `reviewed_by` attribution from Fase 2.
- **Status bar**: coverage metrics (tables/columns/FKs, % described/% reviewed, pending, progress) — the v1 `coverage-stats` behavior computed from loaded data.
- **Import & update flow**: create project from SQL (parse via API), and the update wizard — preview from the API diff, explicit rename selectors, confirm → apply; plus export (v1 JSON download) and import (v1 JSON upload).
- Minimal Playwright smoke: login → create → import SQL → describe → approve → export.

## Capabilities

### New Capabilities
- `web-editor`: the authenticated editing surface — login/session UI, project selection, semantic tree, metadata editor with review workflow, coverage status bar.
- `web-import-wizard`: creating a project from SQL and the multi-step update wizard (preview → renames → confirm → apply) plus JSON export/import.

### Modified Capabilities
_None — v1 capabilities stay frozen with `legacy/`; v2 UI specs restate their durable behavior against the new stack._

## Non-goals

- Visual polish/pixel parity with v1, drag-and-drop, i18n, PWA/offline, DBViewer route (Fase 6), agent/MCP surfaces (Fases 4–5), accessibility audit.

## Impact

- `apps/web` grows routes (`/login`, `/`), components (tree, editor, status bar, wizard), API client, Tailwind design tokens echoing the v1 palette, tests (`bun test` + happy-dom/Testing Library) and `e2e/smoke.ts` (Playwright, gated script).
- `bun run dev` runs API (3000) + web (5173) with Vite proxy for `/api`.
- Backend: no behavior change (a read-only `GET /api/projects/{id}/coverage`-style endpoint may be added if computing coverage client-side proves wasteful — allowed, additive).
- `legacy/` untouched.
