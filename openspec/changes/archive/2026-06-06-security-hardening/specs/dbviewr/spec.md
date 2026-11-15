# Delta — dbviewer

## MODIFIED Requirements

### Requirement: Project JSON loading

The page MUST accept a project JSON file as input and render its database, tables, and columns in a read-only layout. The internal helpers used by the renderer MUST be defined in the external `dbviewer.js` script that `dbviewer.html` loads.

#### Scenario: File input loads a project

- **WHEN** the user selects a JSON file through the file input
- **THEN** the page MUST parse the file and render the database
- **AND** the database name MUST appear in the topbar

#### Scenario: Required DOM scaffolding

- **WHEN** the page is loaded
- **THEN** it MUST expose a file input with id `json-input`, a search input with id `search-input`, a table navigation element with id `table-nav`, a content area with id `content`, and a theme toggle with id `theme-toggle`

#### Scenario: Internal helpers

- **WHEN** `dbviewer.html` is loaded
- **THEN** it MUST reference an external script via `<script src="dbviewer.js"></script>`
- **AND** `dbviewer.js` MUST define `normalizeProject(json)`, `computeStats(db)`, `renderTable(table)`, and `renderRelationships(table)`
- **AND** `dbviewer.js` MUST contain a `relationships-panel` element used by the relationships renderer
- **AND** `dbviewer.js` MUST define `applyTheme(theme)` for theme switching

## ADDED Requirements

### Requirement: Page is served under the static-site-security controls

The page MUST be served with the SRI, CSP, and "no inline scripts/handlers" controls defined in the `static-site-security` specification.

#### Scenario: Page is served under static-site-security

- **WHEN** `dbviewer.html` is loaded
- **THEN** the page MUST satisfy every `Requirement` of the `static-site-security` capability (SRI on CDN resources, a `<meta http-equiv="Content-Security-Policy">` in the head, no inline `<script>` or `<style>` block, no `on*=` handlers, and external CSS/JS in standalone files)
- **AND** the executable contract `tests/dbviewer.test.js` MUST assert the absence of inline blocks in `dbviewer.html` and the presence of the `<script src="dbviewer.js">` and `<link rel="stylesheet" href="dbviewer.css">` references
