# Repository Guidelines

## Project Structure & Module Organization

This repository is a small static DBMapper web app. Core files are at the root:

- `dbmapper.html` defines the UI shell and loads external CDN dependencies.
- `dbviewr.html` is the read-only companion site (loads `dbviewr.css` + `dbviewr.js`).
- `dbviewr.css` contains the full design system and layout styles for the viewer.
- `dbviewr.js` contains the viewer state, JSON loading, search, table navigation, relationships panel, and theme toggle.
- `style.css` contains the full design system and layout styles for the editor.
- `app.js` contains client-side state, SQL parsing, rendering, import/export, and editor behavior.
- `example.sql` and `db_axiis.sql` are SQL inputs for local testing.

Keep new app code in these root files unless the project is intentionally reorganized.

## Build, Test, and Development Commands

There is no package manager or build step. Run the app as a static site:

- `python3 -m http.server 8000` starts a local server from the repo root.
- Open `http://localhost:8000/dbmapper.html` to use the app.
- Import `example.sql` or `db_axiis.sql` through the UI to test SQL parsing.
- Use the Save/Open Project buttons to verify JSON export and import behavior.

Avoid adding tooling unless it solves an immediate maintenance need.

## Coding Style & Naming Conventions

Use 4-space indentation in HTML, CSS, and JavaScript. JavaScript uses `camelCase` for functions and variables, `const`/`let`, and direct DOM APIs. Keep UI text in Portuguese unless changing a product label such as "DBMapper" or "Semantic Layer".

CSS uses custom properties in `:root`, class selectors with kebab-case, and section comments. Reuse existing color, radius, shadow, and spacing variables before introducing new values.

## Testing Guidelines

Ad-hoc Node `assert` scripts under `tests/` are the executable contract for the capabilities that use them. Run the relevant script before considering a change done, and update the corresponding test if the change alters the contract:

- `node tests/sql-import.test.js` — executable contract for the `sql-import` capability (parser: `parseSQLToTables`, `parseAlterTableForeignKeys`, `normalizeRelationships`).
- `node tests/update-model.test.js` — executable contract for the `model-update-wizard` capability, and a secondary check on the parser.
- `node tests/dbviewr.test.js` — executable contract for the `dbviewr` capability.

For each change, also manually verify the browser flow that it touches:

- Load the page without console errors.
- Import a SQL file and confirm tables/columns render in the sidebar.
- Edit descriptions, business terms, and reviewed status.
- Save to JSON, reload that JSON, and confirm metadata persists.

For SQL parser changes, test at least one file with constraints and one with multiple tables.

## Commit & Pull Request Guidelines

This directory is not currently a Git repository, so no local commit history is available. Use clear, imperative commit messages if version control is added, for example `Fix SQL column parsing for decimal types`.

Pull requests should include a concise summary, changed files, manual test steps, and screenshots or screen recordings for UI changes.

## Agent-Specific Instructions

Keep changes focused and preserve the static-site setup. Do not introduce frameworks, bundlers, or external build dependencies without explicit approval.

### Language

Always communicate with the user in Brazilian Portuguese. Use English only for reserved words, technical terms with no widely accepted Portuguese equivalent (for example: `commit`, `pull request`, `merge`, `refactor`, `parser`, `wizard`, `build`, `deploy`, `toast`, `cookie`), product names (`DBMapper`, `Semantic Layer`, `Materialize`, `OpenSpec`, `GitHub`), file/folder names, code identifiers, and other well-known names that read better in English in their original form.
