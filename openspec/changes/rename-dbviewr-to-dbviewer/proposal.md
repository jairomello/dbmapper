## Why

The read-only companion site has shipped under the misspelled name `dbviewr` since its first release (visible in the browser tab, the in-page brand, the source files, the tests, the spec, and every cross-reference in the docs and OpenSpec artifacts). The typo is small but it leaks into every layer of the project — the user-facing label, the localStorage key, the GitHub-rendered URLs, the test runner output, and the capability name in `openspec/specs/`. We want to ship a clean `1.0` of the application, and the misspelling has to go before that cut.

## What Changes

- Rename the four viewer source files at the repo root: `dbviewr.html` → `dbviewer.html`, `dbviewr.js` → `dbviewer.js`, `dbviewr.css` → `dbviewer.css`.
- Rename the executable contract `tests/dbviewr.test.js` → `tests/dbviewer.test.js` and update its assertions to point at the new file paths and the new title.
- Rename the OpenSpec capability folder `openspec/specs/dbviewr/` → `openspec/specs/dbviewer/` and migrate the spec body to use the new paths, title, brand, and localStorage key.
- Update the in-page brand (`DBViewr` → `DBViewer`) and the document title (`DBViewr - Dicionário de Dados` → `DBViewer - Dicionário de Dados`).
- Replace the localStorage key `dbviewr-theme` with `dbviewer-theme` in `dbviewer.js`. The previous preference is intentionally not migrated: this is a typo fix at `1.0`, not a long-lived product, and a one-time theme reset is acceptable.
- Update every cross-reference in the repo (AGENTS.md, README.md, CONTRIBUTING.md, SECURITY.md, THIRD_PARTY_NOTICES, .gitignore, openspec/config.yaml, openspec/specs/*, openspec/changes/*) so the spelling is consistent.
- Re-run the executable contract for the renamed capability and visually verify the page loads without console errors.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `dbviewer` (renamed from `dbviewr`): the capability folder is renamed, the title and brand strings inside the spec change, the localStorage key changes, and the executable contract file referenced by the spec is renamed. The behavioral requirements (search, theme toggle, `REMOVED` filter, relationships panel, PK-first column sort) stay identical.
- `static-site-security`: the spec still requires that `dbviewer.html` reference external `dbviewer.js` and `dbviewer.css` with no inline script or style block; only the filenames change.
- `project-persistence`: the cross-reference to the viewer consumer changes its name and the test path it points at.

## Impact

- **Source code** — `dbviewer.html`, `dbviewer.js`, `dbviewer.css`, `tests/dbviewer.test.js` are renamed and edited. `app.js` is not touched (the editor never references the viewer by filename).
- **OpenSpec** — `openspec/specs/dbviewer/` replaces `openspec/specs/dbviewr/`. `openspec/config.yaml` updates the capability description. Existing change folders under `openspec/changes/` (and the `archive/` ones) get their references updated to the new spelling so the historical record stays consistent.
- **Docs** — `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES`, `.gitignore`.
- **Users** — anyone who previously opened the viewer in a browser will see a one-time theme reset because the localStorage key changes. No data, no project JSON, no URL behavior changes.
- **Tooling** — none. The repo stays a zero-build static site; no `package.json`, no bundler, no framework.
- **Git** — the four renamed source files and the renamed test will appear as `R` (rename) in `git status`, preserving history. The renamed spec folder will also show as a rename.

## Non-goals

- Migrating the old `dbviewr-theme` localStorage value to `dbviewer-theme`. Out of scope for a typo fix at `1.0`.
- Renaming `DBMapper` itself or the editor (`dbmapper.html`, `app.js`, `style.css`).
- Adding redirects, aliases, or backwards-compatibility shims. The misspelling is dropped.
