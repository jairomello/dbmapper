# project-viewer Specification

## Purpose
The read-only DBViewer route: any authenticated user inspects a project's dictionary — tree, search, coverage and item detail with source/review badges — with zero mutation affordances, fed by the v1 export contract.

## Requirements

### Requirement: Viewer loads export data

`/viewer/:id` MUST render the project from `GET /api/projects/:id` (the project view carrying the model plus review/source metadata) for any authenticated role, including `VIEWER`. An unknown project id MUST show a friendly not-found state with a link back to the gallery; an unauthenticated visitor MUST be redirected to login.

#### Scenario: Viewer renders the dictionary

- **WHEN** an authenticated user opens `/viewer/:id` for an existing project
- **THEN** the page MUST show the project's tables and columns from the export payload
- **AND** no session or role above `VIEWER` MAY be required beyond being authenticated

#### Scenario: Unknown project shows a friendly state

- **WHEN** the id does not exist
- **THEN** the page MUST show a not-found message with a navigation link to the gallery
- **AND** no error stack or raw response MUST be displayed

#### Scenario: Unauthenticated access goes to login

- **WHEN** a visitor without a session opens `/viewer/:id`
- **THEN** they MUST be redirected to the login page

### Requirement: Read-only surface

The viewer MUST NOT render any mutation control (save, approve, import, update wizard, suggestion actions) and MUST NOT issue any non-GET request during load or interaction.

#### Scenario: No mutating controls exist

- **WHEN** the viewer page is fully rendered
- **THEN** no button or input that triggers a write (Salvar, Aprovar, Importar, wizard, sugestões) MUST be present in the DOM

#### Scenario: Only GET requests are issued

- **WHEN** the user loads the page, searches and selects items
- **THEN** every fetch the page performs MUST use the GET method

### Requirement: Review transparency

The item detail MUST show the description, business terms, review state and `description_source` (humano/IA/MCP), including the "revisar" state for agent- or MCP-written descriptions that lack human approval.

#### Scenario: Source badge for machine-written metadata

- **WHEN** the selected item has `description_source` other than `human` and `reviewed: false`
- **THEN** the detail MUST display the origin and a "revisar" indication
- **AND** the description text MUST be visible read-only
