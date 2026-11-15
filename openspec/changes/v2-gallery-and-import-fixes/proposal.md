# Proposal

## Why

First test round by Jairo (Fase 3) surfaced two UX gaps and one contract bug: after login the app drops straight into a single-project workspace instead of a multiprojeto gallery (the azyboard pattern he wants); importing a real JSON exported by DBMapper 1.0 fails with an invalid-JSON error (the import schema is stricter than the v1 contract); and SQL/JSON file import controls exist but are too subtle to discover. This change fixes all three so the test loop keeps moving.

## What Changes

- **Project gallery**: `/` becomes a post-login gallery — a card per project (name, description, updated timestamp), click to open `/project/:id`, and a prominent "Novo projeto" flow (name + SQL file/text, or JSON file). Login redirects to the gallery; the workspace lives under `/project/:id`.
- **Legacy JSON import fixed**: the server import schema stops rejecting v1 exports — unknown fields are stripped, missing fields backfilled (the `project-api` spec already requires this), and a regression test locks it with a fixture derived from the actual v1 export code in `legacy/app.js`.
- **Prominent file import**: "Importar arquivo `.sql`" and "Importar arquivo `.json`" become obvious actions (styled buttons/drop areas) in the gallery/new-project flow and inside the project wizard — large `.sql` files are read client-side and submitted as text.

## Capabilities

### New Capabilities
- `project-gallery`: the authenticated multiprojeto landing — project cards, empty state, opening a project, and creating one from SQL or JSON.

### Modified Capabilities
- `web-editor`: login success lands on the gallery (was: straight to the workspace).
- `web-import-wizard`: explicit scenarios for `.sql` file upload (large files) and for importing a legacy DBMapper 1.0 JSON (unknown/missing fields tolerated).

## Non-goals

- Project rename/delete/archive, pagination of huge galleries, drag-and-drop between projects, server-side file storage (uploads stay client-read), GitHub integration inside the app.

## Impact

- Web: new gallery page, route reshuffle (`/`, `/project/:id`), import affordance components; the import endpoint already exists — only its tolerance changes server-side.
- API: `projectDocumentSchema` becomes tolerant (strip unknown, backfill) — behavior already mandated by `project-api`'s "Legacy JSON imports cleanly" requirement; one regression fixture added.
- `legacy/` untouched (the fixture is derived from reading it, not modifying it).
