## Why

Today, clicking "Salvar" immediately downloads a file with a name derived from the database name (`dbmapper-<dbname>.json`). Users have no chance to rename before saving, no timestamp to keep multiple versions distinct, and the same generic "Novo Banco" name is reused for every fresh project. The change introduces a prompt that lets the user confirm or edit a suggested filename, with a timestamp prefix that makes chronological versions obvious in the Downloads folder, while still remembering the human-readable base name across saves of the same project.

## What Changes

- Add a modal (Materialize) opened by the "Salvar" button that asks the user for a filename and prefills it with a suggestion.
- Build the suggestion as `AAAA-MM-DD-HH-MM-<base>.json`, where `<base>` is:
  - The base name from the last saved/opened file of the same in-memory project (preserved across saves), or
  - The current `projectData.database.name` if the user already edited it, or
  - The SQL database name extracted by the parser on import, or
  - `mapper` as a final generic fallback.
- Track the last suggested base name in memory for the lifetime of the project so a second "Salvar" updates only the date/time prefix.
- Keep exporting the same JSON content as today (`JSON.stringify(projectData, null, 2)`); only the prompt and the default filename change.
- Keep "Abrir Projeto" reading the picked file the same way; record the picked file's base name (sans any leading `AAAA-MM-DD-HH-MM-` prefix) as the project's base name for future saves.

## Capabilities

### New Capabilities
_None._

### Modified Capabilities
- `project-persistence`: The "Project export to JSON" requirement gains a modal prompt, a timestamped default filename, and in-memory base-name tracking. New scenarios cover the prompt, the timestamp format, the base-name carryover across saves of the same project, and the SQL-name / `mapper` fallback. The "Project import from JSON" requirement gains a scenario that records the picked file's base name for use by the next save.

## Impact

- `app.js` — `exportProjectJSON` becomes `promptExportProjectJSON` (or equivalent); new helpers for the modal, the timestamp, the base-name derivation, and the strip-leading-prefix helper. `handleJSONUpload` records the picked file's base name. A new `currentProjectBaseName` module-level state is added.
- `index.html` — new modal markup (hidden by default) for the save prompt with an input pre-filled with the suggestion and two buttons ("Salvar" / "Cancelar").
- `style.css` — minor adjustments to size the new input/modal consistently with the existing editor panel, only if Materialize defaults are not enough.
- `tests/` — extend `tests/project-persistence.test.js` (new executable contract) with assertions for the timestamp format, the base-name carryover, the SQL-name fallback, and the `mapper` fallback. The new test file `require`s `app.js` like the others.
- No new dependency, no framework, no build step. Modal reuses Materialize (`M.Modal`) already loaded from the CDN.
