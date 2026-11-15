# Design — v2-phase3-web-ui

## Context

Backend is complete through Fase 2 (project API, SQL import preview/apply, cookie auth with roles). `apps/web` is a Vite+React placeholder. The v1 UI's durable behavior is specified in the frozen capabilities (`schema-tree`, `semantic-editor`, `coverage-stats`, `model-update-wizard`) and re-stated for v2 in this change's `web-editor` / `web-import-wizard` specs.

## Goals / Non-Goals

**Goals:** a human can log in, create/import a project, navigate, document, approve, watch coverage, run the update wizard and round-trip JSON — in PT-BR, on the v1 mental model.

**Non-goals:** pixel parity with v1, drag-and-drop, virtualized rendering for huge schemas, i18n, offline, DBViewer (Fase 6), agent/MCP UI (Fase 4–5).

## Decisions

1. **Stack: React 18 + Vite + TanStack Query + react-router (2 routes: `/login`, `/`) + Tailwind CSS** — the azyboard frontend stack minus its domain. *Alternative:* reuse `legacy/style.css` wholesale — rejected: DOM-era design system without utility layer; instead Tailwind tokens **echo the v1 palette** (`--accent: #6d5dfc`, ink/bg/radius vars) so the product keeps its look.
2. **Thin typed API client** (`src/api/`): `fetch` with `credentials: 'include'`, single error-envelope parser, one typed function per endpoint. React Query owns cache/invalidations (mutations invalidate the project query so tree/badges/status bar recompute).
3. **Auth guard as a route wrapper**: queries `/api/auth/me`; unauthenticated → `/login`. Session lives in the HttpOnly cookie; no token in JS (Fase 2 design).
4. **Coverage computed client-side**: port `computeStats` (`legacy/app.js:823-849`) to a pure module with the v1 `coverage-stats` test ported alongside — no new backend endpoint (the proposal allowed one; client-side is trivial and keeps the API surface unchanged).
5. **Wizard is a presentation of the server preview**: upload → one `preview` call → client renders steps (tables → columns → relationships → summary) from the returned plan; rename selects mutate the plan client-side and are passed explicitly to `apply`. No diff logic in the UI — the server owns classification (Fase 1 spec).
6. **Component tests: `bun test` + happy-dom + Testing Library** (azyboard's `test:web` pattern) colocated in `apps/web/src`; **E2E: Playwright smoke** (`e2e/smoke.ts`, script `test:e2e`, not in `check` to keep the gate fast): boot API+web → seed admin → login → create project from `legacy/example.sql` → describe → approve → export JSON.
7. **Dev ergonomics**: `bun run dev` starts API (:3000, `PORT` env honored) and web (:5173) with Vite proxy `/api → :3000`. `.env.example` gains nothing; seed command documented for the first login.

## Risks / Trade-offs

- [Large tree without virtualization] → acceptable per v1 parity (v1 didn't virtualize); revisit if huge schemas hurt.
- [Playwright browsers must install in the work dir] → `bunx playwright install chromium` in `~/work/dbmapper` only; never in the share; smoke gated behind `test:e2e`.
- [Tailwind purge mistakes hide classes] → safelist status/badge utilities or use explicit components; caught by component tests.
- [Wizard/server contract drift] → the preview payload is typed from the API contract (`packages/contracts`) and exercised by tests.

## Migration Plan

Frontend-only change plus optional additive backend endpoint — no schema or contract changes. Steps: implement + verify in `~/work/dbmapper/` (including `bunx playwright install chromium` + `bun run test:e2e`), copy source to the share, commit. Rollback: revert the commit; backend and `legacy/` unaffected. Deploy: notebook-first (Fase 6 for labapps/Vultr).
