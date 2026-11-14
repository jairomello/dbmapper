# Repository Guidelines

## Project Structure & Module Organization

This repository holds the DBMapper data-dictionary/semantic-layer tool. The v1
static app is frozen under `legacy/`; the v2 (server, multi-user, agent + MCP)
is planned — see `docs/analysis/`.

Root:

- `README.md` — project overview, JSON contract, quick start.
- `AGENTS.md` — this guide (human/agent source of truth for conventions).
- `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, `THIRD_PARTY_NOTICES`.
- `docs/analysis/` — v1 diagnosis (`01-`), Azy Board reuse analysis (`02-`),
  and the v2 evolution proposal (`03-proposta-evolucao-v2.md`).
- `openspec/` — specs and change sets; cross-cutting changes are driven here.

`legacy/` (v1 — frozen static app):

- `dbmapper.html` defines the UI shell and loads external CDN dependencies.
- `dbviewer.html` is the read-only companion site (loads `dbviewer.css` + `dbviewer.js`).
- `dbviewer.css` contains the full design system and layout styles for the viewer.
- `dbviewer.js` contains the viewer state, JSON loading, search, table navigation, relationships panel, and theme toggle.
- `style.css` contains the full design system and layout styles for the editor.
- `app.js` contains client-side state, SQL parsing, rendering, import/export, and editor behavior.
- `example.sql` is a SQL input for local testing.
- `tests/` are the executable contracts; `legacy/README.md` documents them.

**Do not add new features to `legacy/`** — bug fixes only. New functionality
belongs to the v2, which is specified through OpenSpec before implementation.

## Build, Test, and Development Commands (v1)

There is no package manager or build step for the v1. Run it as a static site:

- `cd legacy && python3 -m http.server 8000` starts a local server.
- Open `http://localhost:8000/dbmapper.html` to use the app.
- Import `example.sql` through the UI to test SQL parsing.
- Use the Save/Open Project buttons to verify JSON export and import behavior.

Avoid adding tooling to `legacy/` unless it solves an immediate maintenance need.

## Coding Style & Naming Conventions (v1)

Use 4-space indentation in HTML, CSS, and JavaScript. JavaScript uses `camelCase` for functions and variables, `const`/`let`, and direct DOM APIs. Keep UI text in Portuguese unless changing a product label such as "DBMapper" or "Semantic Layer".

CSS uses custom properties in `:root`, class selectors with kebab-case, and section comments. Reuse existing color, radius, shadow, and spacing variables before introducing new values.

The v2 will use TypeScript strict + Biome + `bun test`; its conventions will be
recorded here when implementation starts.

## Testing Guidelines

Ad-hoc Node `assert` scripts under `legacy/tests/` are the executable contract
for the capabilities that use them. Run them **from `legacy/`** (paths are
cwd-relative) and update the corresponding test if a change alters the contract:

```bash
cd legacy
node tests/sql-import.test.js           # sql-import capability (parser)
node tests/update-model.test.js         # model-update-wizard capability
node tests/coverage-stats.test.js       # coverage-stats capability
node tests/dbviewer.test.js             # dbviewer capability
node tests/project-persistence.test.js  # project-persistence filename helpers
```

For each change, also manually verify the browser flow that it touches:

- Load the page without console errors.
- Import a SQL file and confirm tables/columns render in the sidebar.
- Edit descriptions, business terms, and reviewed status.
- Save to JSON, reload that JSON, and confirm metadata persists.

For SQL parser changes, test at least one file with constraints and one with multiple tables.

## Commit & Pull Request Guidelines

This repository has local git history (remote: `github.com/jairomello/dbmapper`).
Use clear, imperative commit messages, for example
`Fix SQL column parsing for decimal types`.

Pull requests should include a concise summary, changed files, manual test steps, and screenshots or screen recordings for UI changes.

## Agent-Specific Instructions

Keep changes focused. For `legacy/`, preserve the static-site setup: do not
introduce frameworks, bundlers, or external build dependencies — that rule is
scoped to the frozen v1. The v2 direction (Bun + React + SQLite server with auth,
agent and MCP) is approved by the project owner and is governed by the OpenSpec
changes in `openspec/`; do not start v2 code outside that flow.

### Language

Always communicate with the user in Brazilian Portuguese. Use English only for reserved words, technical terms with no widely accepted Portuguese equivalent (for example: `commit`, `pull request`, `merge`, `refactor`, `parser`, `wizard`, `build`, `deploy`, `toast`, `cookie`), product names (`DBMapper`, `Semantic Layer`, `Materialize`, `OpenSpec`, `GitHub`), file/folder names, code identifiers, and other well-known names that read better in English in their original form.
