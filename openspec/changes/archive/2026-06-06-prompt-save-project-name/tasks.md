## 1. Add module-level state and pure helpers in `app.js`

- [x] 1.1 Add `let currentProjectBaseName = null;` and `let sqlDatabaseName = null;` next to the existing module-level state at the top of `app.js`.
- [x] 1.2 Add an exported pure helper `buildTimestamp(date)` that returns `YYYY-MM-DD-HH-MM` from a `Date`, zero-padded, using `getFullYear`, `getMonth()+1`, `getDate()`, `getHours()`, `getMinutes()`.
- [x] 1.3 Add an exported pure helper `stripTimestampPrefix(stem)` that returns the input with a leading `^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-` removed; returns the original string when the prefix is absent.
- [x] 1.4 Add an exported pure helper `slugifyBaseName(value)` that lowercases the input, trims it, and replaces whitespace with hyphens (reusing the same normalization the existing export uses, minus the `dbmapper-` prefix).
- [x] 1.5 Add an exported pure helper `resolveBaseName(state)` where `state = { currentProjectBaseName, projectData, sqlDatabaseName }` and that implements the chain: recorded base → edited database name → SQL database name → `mapper`.

## 2. Capture the SQL database name during import

- [x] 2.1 Inspect `parseSQLToTables` in `app.js` to identify where `CREATE DATABASE` (or equivalent) is matched. Extract the database name into a local `let capturedDbName = null;` and assign it to the module-level `sqlDatabaseName` when a name is found.
- [x] 2.2 In `handleSQLUpload`, after a successful parse, clear `currentProjectBaseName = null` and keep the captured `sqlDatabaseName` so the suggestion chain can use it.
- [x] 2.3 Confirm `tests/sql-import.test.js` still passes (`node tests/sql-import.test.js`); the `parseSQLToTables` signature MUST NOT change.

## 3. Record the picked file's base name on import

- [x] 3.1 In `handleJSONUpload`, capture `event.target.files[0].name` and `stripTimestampPrefix` the stem (after removing `.json`) into `currentProjectBaseName`.
- [x] 3.2 Set `sqlDatabaseName = null` in the same handler so a JSON import does not leak a SQL name into a later save.

## 4. Build the save-prompt modal in `index.html`

- [x] 4.1 Add a hidden Materialize modal `#save-prompt-modal` with a labeled text input `#save-prompt-filename`, a primary "Salvar" button `#save-prompt-confirm`, and a secondary "Cancelar" button `#save-prompt-cancel`. Use 4-space indentation and kebab-case IDs consistent with the existing markup.
- [x] 4.2 Give the modal a Portuguese title (e.g., "Salvar projeto") and an inline error placeholder `<small id="save-prompt-error" class="red-text"></small>` under the input.

## 5. Wire the modal behavior in `app.js`

- [x] 5.1 Replace the existing `exportProjectJSON` click handler on `#btn-save-project` with a call to a new `openSavePrompt` function that (a) computes the suggestion via `resolveBaseName` + `buildTimestamp`, (b) writes it into `#save-prompt-filename`, (c) clears the error label, and (d) calls `M.Modal.getInstance(...).open()`.
- [x] 5.2 Add a click handler on `#save-prompt-confirm` that trims the input, validates it (non-empty, characters sanitized to `[A-Za-z0-9._-]`, `.json` appended if missing), sets the error label on failure, and on success calls the existing download logic with the user-confirmed value and closes the modal.
- [x] 5.3 Add a click handler on `#save-prompt-cancel` (or rely on `M.Modal`'s dismissible behavior) that closes the modal without downloading.
- [x] 5.4 Factor the actual download into a small helper `downloadProjectJSON(filename)` so both the modal's confirm path and any future caller can reuse it; this is the only place that creates the `Blob` and triggers the `<a download>` click.
- [x] 5.5 Export the new pure helpers from `app.js`'s `module.exports` block at the bottom so the test can import them.

## 6. Add the executable contract `tests/project-persistence.test.js`

- [x] 6.1 Create `tests/project-persistence.test.js` that `require('../app.js')` and uses `node:assert/strict`. Cover `buildTimestamp`, `stripTimestampPrefix`, `slugifyBaseName`, and `resolveBaseName` with the cases from the design (timestamp with a fixed `Date`, prefix present/absent, base-name chain in all four branches, edited-vs-default database name, SQL name fallback, `mapper` fallback).
- [x] 6.2 End the file with `console.log('project-persistence: ok');` like the other test scripts.
- [x] 6.3 Run `node tests/project-persistence.test.js` and confirm it prints `ok`.

## 7. Validate

- [x] 7.1 Run `node tests/sql-import.test.js`, `node tests/update-model.test.js`, `node tests/dbviewr.test.js`, `node tests/coverage-stats.test.js` (if present), and `node tests/project-persistence.test.js`; all MUST print their `ok` line.
- [x] 7.2 Start `python3 -m http.server 8000` and load `http://localhost:8000/index.html` in a browser. Confirm the page loads with no console errors.
- [x] 7.3 Import `example.sql` and confirm the "Salvar" modal opens with a timestamped suggestion whose base is the SQL database name (or `mapper` if none).
- [x] 7.4 Edit the database name in the editor, click "Salvar" again, confirm the suggestion's base now matches the edited name.
- [x] 7.5 Click "Salvar" twice in a row without reloading, confirm the second suggestion keeps the same base and updates only the timestamp.
- [x] 7.6 Save a JSON file, then "Abrir Projeto" that same file, click "Salvar", confirm the suggestion's base is the original stem (with the timestamp prefix stripped).
- [x] 7.7 Open a saved JSON in `dbviewr.html` and confirm it still renders identically to a pre-change export (the JSON shape is unchanged).

## 8. Refine the save-prompt modal styling

The wizard's `.update-dialog` is 1180×820 and was designed for a multi-step flow; reusing it for a one-line filename prompt left a huge empty area and made the modal look out of place. Scope new styles to `#save-prompt-modal` so the wizard remains untouched.

- [x] 8.1 Add a `/* ── Save Prompt Dialog ── */` section in `style.css` that overrides `.update-modal.is-open` inside `#save-prompt-modal` to `display: flex; align-items: center; justify-content: center; padding: 16px;`.
- [x] 8.2 Constrain `#save-prompt-modal .update-dialog` to `width: min(480px, 100%); height: auto; max-height: calc(100vh - 32px); margin: 0; position: relative;` so the dialog shrinks to content and centers inside the overlay.
- [x] 8.3 Tighter header (`padding: 14px 18px 10px; background: var(--surface);`), smaller `h2` (16px), and a muted `p` (12px) so the header matches the editor card.
- [x] 8.4 Tighter body (`flex: 0 0 auto; overflow: visible; padding: 6px 18px 14px; background: var(--surface);`) and reset `.editor-section` inside the save modal (`padding: 0; border-bottom: none;`).
- [x] 8.5 Override `#save-prompt-filename` to a single-line input (`min-height: 0; height: 38px; padding: 8px 12px; font-size: 13px; font-family: var(--font-mono); resize: none;`) so it stops inheriting the 120px textarea style.
- [x] 8.6 Reserve space for the inline error label (`#save-prompt-error` `min-height: 16px; margin-top: 6px; font-size: 11px;`) so layout doesn't jump when an error appears.
- [x] 8.7 Lighter footer (`padding: 10px 18px 12px; background: var(--surface); border-top: 1px solid var(--border);`) so the dialog reads as a compact prompt rather than a wizard step.
- [x] 8.8 Re-run `node tests/project-persistence.test.js` and `node tests/sql-import.test.js` to confirm the JS path is untouched.
- [x] 8.9 Center the save modal: `M.Modal.open()` was setting inline `display: block` on `#save-prompt-modal`, overriding the `display: flex` from `#save-prompt-modal.is-open` (specificity `(1,1,0)` vs `(0,2,0)`) and pushing the dialog to the top-left. Replace the `M.Modal.getInstance/init/open/close` calls in `openSavePrompt`/`closeSavePrompt` with a pure `.is-open` class toggle (same pattern the wizard uses), and wire `click` on `.update-modal-backdrop` + `Escape` keydown so dismissibility is preserved without Materialize.

## 9. Archive

- [x] 9.1 Run `openspec archive prompt-save-project-name --yes` (or follow the project's archive skill flow) to fold the delta spec into `openspec/specs/project-persistence/spec.md` and move the change into `openspec/changes/archive/`.
- [x] 9.2 Re-run the four test scripts to confirm the archived spec still matches the implementation.
