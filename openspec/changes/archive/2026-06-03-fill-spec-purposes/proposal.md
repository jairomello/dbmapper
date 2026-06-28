## Why

When `bootstrap-initial-specs` was archived, the OpenSpec template left a `TBD - created by archiving change ... Update Purpose after archive.` placeholder in the `## Purpose` section of every promoted spec. Seven specs in `openspec/specs/` still carry that placeholder. The `## Purpose` paragraph is what a reader sees first when opening a spec; leaving it as a `TBD` makes the spec feel unfinished and buries the "what is this for" answer under the requirements. This is a hygiene change: replace each placeholder with a short, behavior-oriented paragraph that names the user-facing responsibility of the capability and points to the executable surface (the relevant `tests/*.test.js` script) when one exists.

## What Changes

- Edit `openspec/specs/sql-import/spec.md`, `openspec/specs/project-persistence/spec.md`, `openspec/specs/schema-tree/spec.md`, `openspec/specs/semantic-editor/spec.md`, `openspec/specs/coverage-stats/spec.md`, `openspec/specs/model-update-wizard/spec.md`, and `openspec/specs/dbviewer/spec.md` to replace the `TBD` `## Purpose` paragraph with a 1–3 sentence summary.
- No requirement is added, removed, or modified. No code is touched. No tests are touched.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

_None — the existing 7 capability specs gain a prose `## Purpose` paragraph but no requirement changes._

## Impact

- `openspec/specs/*/spec.md` (7 files): each `## Purpose` section is edited. No `## Requirements` content is touched.
- `app.js`, `index.html`, `style.css`, `dbviewer.html`: not modified.
- `tests/*`: not modified.
- `AGENTS.md`, `openspec/config.yaml`: not modified (the config edit is a separate change, `configure-openspec-context`).
- No build step, no new dependencies, no deployment impact.
