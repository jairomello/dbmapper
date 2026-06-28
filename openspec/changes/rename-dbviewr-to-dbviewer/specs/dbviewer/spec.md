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

### Requirement: Light and dark theme with persistence

The viewer MUST support a light theme and a dark theme, with the choice persisted across reloads.

#### Scenario: Theme toggle present

- **WHEN** the page is loaded
- **THEN** the `body.theme-dark` class MUST be the documented dark-theme hook
- **AND** the `#theme-toggle` element MUST be present in the DOM

#### Scenario: Theme persists in localStorage

- **WHEN** the user toggles the theme
- **THEN** the selected theme MUST be written to `localStorage` under the `dbviewer-theme` key

#### Scenario: Theme is restored on reload

- **WHEN** the page is reloaded with a stored theme
- **THEN** `applyTheme(theme)` MUST read the stored value and apply the corresponding class to the body

### Requirement: Capability Purpose paragraph

The `## Purpose` section of this spec MUST describe the capability in 1–3 behavior-oriented sentences, must NOT contain the placeholder `TBD - created by archiving`, and MUST name the executable test script (if any) and the cross-cutting `project-persistence` contract (if relevant).

#### Scenario: Purpose paragraph is non-placeholder

- **WHEN** a reader opens this spec file
- **THEN** the `## Purpose` section MUST NOT contain the string `TBD - created by archiving`
- **AND** the section MUST contain at least one complete sentence describing the capability's user-facing responsibility

### Requirement: Page is served under the static-site-security controls

The page MUST be served with the SRI, CSP, and "no inline scripts/handlers" controls defined in the `static-site-security` specification.

#### Scenario: Page is served under static-site-security

- **WHEN** `dbviewer.html` is loaded
- **THEN** the page MUST satisfy every `Requirement` of the `static-site-security` capability (SRI on CDN resources, a `<meta http-equiv="Content-Security-Policy">` in the head, no inline `<script>` or `<style>` block, no `on*=` handlers, and external CSS/JS in standalone files)
- **AND** the executable contract `tests/dbviewer.test.js` MUST assert the absence of inline blocks in `dbviewer.html` and the presence of the `<script src="dbviewer.js">` and `<link rel="stylesheet" href="dbviewer.css">` references

## ADDED Requirements

### Requirement: Viewer is published under the correct name

The viewer MUST ship under the spelling `DBViewer` (in-page brand and `<title>`) and MUST be served from `dbviewer.html` at the repo root. The misspelled `dbviewr` name MUST NOT appear in any user-facing string, filename, localStorage key, executable contract, or OpenSpec artifact that ships as part of the project.

#### Scenario: No `dbviewr` references remain in shipped artifacts

- **WHEN** a reader inspects `dbviewer.html`, `dbviewer.js`, `dbviewer.css`, `tests/dbviewer.test.js`, or `openspec/specs/dbviewer/spec.md`
- **THEN** none of these files MUST contain the substrings `dbviewr` or `DBViewr`
- **AND** the `localStorage` key used by the theme toggle MUST be `dbviewer-theme`
