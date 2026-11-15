# Design — v2-gallery-and-import-fixes

## Context

Fase 3 shipped the workspace at `/` with a project selector; Jairo's first test round demanded a multiprojeto gallery (azyboard pattern), exposed that the v1 JSON import rejects real legacy files (`.strict()` Zod at every level), and showed the existing file inputs are too subtle. The share copy of the repo is gone (project migrating to GitHub as source of truth — see workflow note below); `~/work/dbmapper` is the working home until GitHub access is configured.

## Goals / Non-Goals

**Goals:** gallery-first navigation; legacy JSON import that accepts what DBMapper 1.0 actually emitted; file import a user cannot miss — all locked by tests.

**Non-goals:** project rename/delete, gallery pagination, drag-and-drop, storing uploaded files server-side, in-app GitHub features.

## Decisions

1. **Route reshuffle**: `/` → gallery (auth), `/project/:id` → workspace; `RequireSession` unchanged, new `RequireProject` guard loads the project or bounces to the gallery. *Alternative:* gallery as a modal over the workspace — rejected: he asked for a landing screen; deep links (`/project/:id`) are also better for sharing.
2. **Gallery data**: reuse `GET /api/projects` (exists since Fase 1); add `updated_at` to the list payload if missing (additive, no spec change). Cards show name, description, updated timestamp; empty state with the "Novo projeto" CTA.
3. **Tolerant import**: replace the `.strict()` chain for the document payload with **strip-unknown + backfill** semantics: top-level still requires `database` (that's the only rejection the spec mandates); nested objects `.strip()` with defaults for missing fields; enum fields that don't match fall back to `UNCHANGED` rather than failing. The same normalization runs through the existing `normalizeDatabaseModel` path so export stays identical.
4. **Regression fixture from the real contract**: derive a v1 export fixture by reading `legacy/app.js` (`downloadProjectJSON` + `handleJSONUpload` backfill) — including fields v2 doesn't model — and lock the import with a test asserting the round-trip preserves descriptions/terms/review. If his actual failing file can be shared later, add it as a second fixture.
5. **Prominent import affordances**: one shared `FileImportButton` component (styled action + optional drop zone, `accept=".sql,.json,text/plain"`, reads with `file.text()`) used in: gallery "Novo projeto" dialog, workspace new-project flow, and the wizard's upload step (replacing bare native inputs). Large files are client-read — no size cap in UI; the API body limit (if any) is checked and documented in tasks.
6. **Migration to GitHub (workflow, per Jairo15/11)**: repo home moves from the rsync share to GitHub — check `git fetch origin` before implementing anything, push after each closed change; notebook does the same. Until auth exists, pushes are queued from `~/work/dbmapper`.

## Risks / Trade-offs

- [Tolerant import hides malformed files] → only structural looseness is tolerated; missing `database` still rejects atomically (spec), and the regression test pins the accepted shape.
- [Route reshuffle breaks deep links/bookmarks from tests so far] → old `/` becomes gallery by design; `/project/:id` covered by tests; smoke E2E updated in the same change.
- [Body size limits on big SQL dumps] → check the server/Hono body limit during implementation; raise it explicitly if needed (documented in README).

## Migration Plan

Code-only change (one additive field possible on the projects list). Steps: implement + verify in `~/work/dbmapper/` (`bun run check`, `bun run test:e2e` updated), commit, push to GitHub once access is configured. Rollback: revert commit. No database migration.
