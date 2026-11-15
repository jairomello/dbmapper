## Context

DBMapper is a static, single-page HTML/JS app for editing a data dictionary. The current save flow is one click away from the file system: `exportProjectJSON` in `app.js:1911` serializes `projectData` and triggers a download with the name `dbmapper-<slug>.json`, where `<slug>` is `projectData.database.name` lowercased and hyphenated. There is no in-memory record of the file the user last loaded or saved.

The user is asking for a confirmation step in front of that download so they can:
- See and edit the filename before it lands in `~/Downloads`.
- Get a timestamped default (`AAAA-MM-DD-HH-MM-<base>.json`) that keeps chronological saves distinct.
- Carry the human-readable `<base>` across saves of the same project, instead of seeing the same "novo-banco" slug over and over.

The project has no build step, no framework, and reuses Materialize CSS from a CDN. Existing modals (the model-update wizard in `app.js:201+`) already use `M.Modal`, so a second modal fits naturally.

## Goals / Non-Goals

**Goals:**
- Replace the immediate download with a Materialize modal that pre-fills a suggested filename and lets the user confirm/edit/cancel.
- Pre-fill with `AAAA-MM-DD-HH-MM-<base>.json`, with `<base>` resolved by a deterministic chain described in Decisions §1.
- Persist the resolved base name in memory for the lifetime of the loaded project so a second "Salvar" updates only the timestamp.
- After loading a JSON project, strip any leading `AAAA-MM-DD-HH-MM-` prefix from the picked file name and use the remainder as the new base name.
- Keep the exported JSON content byte-for-byte identical to today.
- Ship a Node `assert` test (`tests/project-persistence.test.js`) that exercises the suggestion helpers.

**Non-Goals:**
- No multi-file "Save As" with project metadata, no autosave, no IndexedDB, no backend.
- No change to the JSON shape, to the "Abrir Projeto" parsing, or to the editor UI.
- No new dependency, no bundler, no framework.
- No localization change to the suggestion format (always ISO-ish `AAAA-MM-DD-HH-MM`).

## Decisions

1. **Base name resolution chain** — Resolve `<base>` in this order, stop at the first match:
   1. The in-memory `currentProjectBaseName` if it is set (covers a second save of the same project and the post-import state).
   2. `projectData.database.name` if it is non-empty and not the literal default `"Novo Banco"` (covers a user who has already edited the database name in the editor).
   3. The SQL database name captured at SQL import time, stored in a new `sqlDatabaseName` module-level string.
   4. The literal string `mapper`.

   Why a chain: each fallback is the most recent human intent the system has, so the user sees their own work reflected without us inventing a name. We deliberately do not auto-derive from the first table name, because the file represents the *database*, not a table.

2. **Strip the timestamp prefix on import** — When a JSON is loaded, parse the picked file name, match `^(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-)?(.*?)\.json$`, and store the captured group 2 (or the full stem if no prefix) into `currentProjectBaseName`. This is the only place where a previously suggested name is overwritten by an external source.

3. **Modal vs. `window.prompt`** — Use a Materialize modal (`M.Modal`) with a text input, a "Salvar" primary button, and a "Cancelar" secondary button. `window.prompt` is blocked in some embedded contexts and looks out of place; the wizard already uses a modal, so the pattern is established. A second "Salvar" click with the modal open is a no-op (the modal disables its primary button while resolving).

4. **Timestamp generation** — Use `new Date()` to build `YYYY-MM-DD-HH-MM` via zero-padded local-time getters (`getFullYear`, `getMonth()+1`, `getDate()`, `getHours()`, `getMinutes()`). Local time matches what the user sees in their file manager; UTC would mismatch by hours in non-UTC zones.

5. **Module-level state** — Add two new `let` bindings at the top of `app.js` next to `hasLoadedProject`:
   - `currentProjectBaseName = null` — the resolved `<base>` for the next save.
   - `sqlDatabaseName = null` — captured by the SQL parser/import path, used as the fallback before `mapper`.
   Both reset to `null` only on "Novo Projeto" (which does not exist yet — see Open Questions) or, for `currentProjectBaseName`, on a fresh SQL import that does not reuse the prior name. Resetting happens inside the same code paths that already reset `hasLoadedProject = false` and `collapseState = {}`.

6. **Picking up the SQL name without changing the parser** — The `parseSQLToTables` function already inspects the SQL header (see the existing SQL parser tests in `tests/sql-import.test.js`). We extend it to optionally return a `{ tables, databaseName }` pair, or — to keep the function signature stable for the existing test contract — to set a module-level `sqlDatabaseName` as a side effect when called. The design favors the side effect because it avoids breaking the existing `require('../app.js').parseSQLToTables` test. The parser change is guarded: if no `CREATE DATABASE` is found, `sqlDatabaseName` stays whatever it was.

7. **Filename validation in the modal** — Trim whitespace; reject empty input with the inline label "Informe um nome de arquivo."; reject characters outside `[A-Za-z0-9._-]` (with the timestamp prefix already there, the user is mostly editing the base) by stripping the rest. Append `.json` if the user omitted it. This avoids the browser silently renaming on download.

8. **Test surface** — Add `tests/project-persistence.test.js` that `require('../app.js')` and exercises exported pure helpers: `buildTimestamp(new Date('2026-06-05T09:07:00'))` returns `"2026-06-05-09-07"`; `suggestSaveFilename(state)` returns `"2026-06-05-09-07-<base>.json"` for the documented state combinations; `stripTimestampPrefix("2026-06-05-09-07-loja.json")` returns `"loja"` and `"loja.json"` returns `"loja"`. These helpers are pure and live in `app.js` next to the other exports.

## Risks / Trade-offs

- [Stale `currentProjectBaseName` after SQL re-import overwrites it] → The same code path that sets `hasLoadedProject = false` on `handleSQLUpload` also clears `currentProjectBaseName` and re-captures `sqlDatabaseName` from the new file.
- [User edits the input and the modal re-opens with a stale value] → The modal re-opens from scratch every time; we re-compute the suggestion right before `M.Modal.open`, so the timestamp is always current.
- [Browser blocks programmatic `download` from a synthetic click triggered outside a user gesture] → The download is triggered from the "Salvar" button's `click` handler inside the modal, which is a real user gesture, so this is safe.
- [Filename collisions in `~/Downloads`] → The timestamp minute resolution means a save within the same minute overwrites. Documented as expected; the modal lets the user edit the stem to disambiguate.
- [Locale ambiguity on the timestamp] → Using `getMonth()+1` etc. on a `Date` is timezone-local, so the timestamp matches the file system. UTC would feel wrong to a user saving in São Paulo at 21:00 and seeing "00:00" the next day.
- [Breaking the existing parser test contract] → The `parseSQLToTables` signature is preserved; the new behavior is a module-level side effect, not a return value. `tests/sql-import.test.js` continues to pass without edits.

## Migration Plan

No data migration: the JSON file format is unchanged, so existing `dbmapper-*.json` files keep opening in both DBMapper and DBViewer.

**Deploy steps:**
1. Land the new helpers, modal markup, and modal event wiring in `app.js` / `index.html` / `style.css`.
2. Land `tests/project-persistence.test.js` and run `node tests/project-persistence.test.js` plus the existing `node tests/sql-import.test.js`, `node tests/update-model.test.js`, and `node tests/dbviewer.test.js` to confirm no regression.
3. Serve with `python3 -m http.server 8000` and manually verify: import a SQL, edit the database name, click "Salvar", confirm the modal opens with the right default, confirm the file lands in `~/Downloads` with the timestamped name, click "Salvar" again, confirm only the timestamp changes.

**Rollback steps:** Revert the commit. The previous `exportProjectJSON` is restored and the modal is removed from `index.html`; no persisted data exists to clean up because `currentProjectBaseName` and `sqlDatabaseName` are in-memory only.
