# dbviewr Specification

## Purpose
Provides a read-only data dictionary page (`dbviewr.html`) that consumes the same JSON project format produced by `project-persistence` and exported by DBMapper. The viewer renders every non-`REMOVED` table with its columns and a relationships panel labeled "Filha de" and "Mãe de", supports search and per-table navigation, copies per-table anchor links, and persists a light/dark theme preference in `localStorage`. Unlike the editor, it deliberately omits internal review and approval status. The executable contract is `tests/dbviewr.test.js`.
## Requirements
### Requirement: Project JSON loading

The page MUST accept a project JSON file as input and render its database, tables, and columns in a read-only layout.

#### Scenario: File input loads a project
- **WHEN** the user selects a JSON file through the file input
- **THEN** the page MUST parse the file and render the database
- **AND** the database name MUST appear in the topbar

#### Scenario: Required DOM scaffolding
- **WHEN** the page is loaded
- **THEN** it MUST expose a file input with id `json-input`, a search input with id `search-input`, a table navigation element with id `table-nav`, a content area with id `content`, and a theme toggle with id `theme-toggle`

#### Scenario: Internal helpers
- **WHEN** the embedded script is loaded
- **THEN** it MUST define `normalizeProject(json)`, `computeStats(db)`, `renderTable(table)`, and `renderRelationships(table)`
- **AND** it MUST contain a `relationships-panel` element used by the relationships renderer
- **AND** it MUST define `applyTheme(theme)` for theme switching

### Requirement: REMOVED tables are hidden

The viewer MUST NOT show tables whose `status` is `REMOVED`, in any of its listings or stats.

#### Scenario: Removed tables are filtered out
- **WHEN** the project JSON contains tables with `status: "REMOVED"`
- **THEN** those tables MUST NOT be rendered in the table list
- **AND** they MUST NOT contribute to the stats shown to the user
- **AND** the underlying `table.status !== 'REMOVED'` check MUST be the single source of truth for this filter

### Requirement: Viewer surface omits internal review status

The viewer is the published, consumer-facing surface of a project and MUST NOT expose the editor's review or approval state in the rendered UI.

#### Scenario: No review status strings
- **WHEN** the page is rendered
- **THEN** the rendered DOM MUST NOT contain the strings `A revisar` or `Aprovado`
- **AND** the DOM MUST NOT contain a `data-filter="missing"` filter control

### Requirement: Search and table navigation

The viewer MUST provide a search input and a table list that, together, let the user filter the visible tables and jump to a specific table's content.

#### Scenario: Search filters tables
- **WHEN** the user types into `#search-input`
- **THEN** the rendered table list MUST be filtered to tables whose name or content matches the query

#### Scenario: Selecting a table from the nav
- **WHEN** the user clicks a table in `#table-nav`
- **THEN** the `#content` area MUST show the table's columns and relationships

### Requirement: Relationships panel with Filha de / Mãe de

The viewer MUST render a relationships panel for each table that shows parents labeled `Filha de` and children labeled `Mãe de`.

#### Scenario: Parents list
- **WHEN** a table has parent relationships
- **THEN** the relationships panel MUST list them under the `Filha de` heading

#### Scenario: Children list
- **WHEN** a table has child relationships
- **THEN** the relationships panel MUST list them under the `Mãe de` heading

### Requirement: Per-table anchor links

The viewer MUST provide a way to copy a per-table anchor link so the user can share a direct link to a specific table.

#### Scenario: Anchor copy available
- **WHEN** a table is rendered
- **THEN** the rendered HTML MUST include a `Link` affordance that the user can use to obtain a link to that table's section

### Requirement: Light and dark theme with persistence

The viewer MUST support a light theme and a dark theme, with the choice persisted across reloads.

#### Scenario: Theme toggle present
- **WHEN** the page is loaded
- **THEN** the `body.theme-dark` class MUST be the documented dark-theme hook
- **AND** the `#theme-toggle` element MUST be present in the DOM

#### Scenario: Theme persists in localStorage
- **WHEN** the user toggles the theme
- **THEN** the selected theme MUST be written to `localStorage` under the `dbviewr-theme` key

#### Scenario: Theme is restored on reload
- **WHEN** the page is reloaded with a stored theme
- **THEN** `applyTheme(theme)` MUST read the stored value and apply the corresponding class to the body

### Requirement: Capability Purpose paragraph
The `## Purpose` section of this spec MUST describe the capability in 1–3 behavior-oriented sentences, must NOT contain the placeholder `TBD - created by archiving`, and MUST name the executable test script (if any) and the cross-cutting `project-persistence` contract (if relevant).

#### Scenario: Purpose paragraph is non-placeholder
- **WHEN** a reader opens this spec file
- **THEN** the `## Purpose` section MUST NOT contain the string `TBD - created by archiving`
- **AND** the section MUST contain at least one complete sentence describing the capability's user-facing responsibility

