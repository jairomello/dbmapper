# diagram-layout Specification

## Purpose
Persist the diagram's visual layout (card positions, viewport and zoom) per
project, independently of the semantic model, through dedicated endpoints with
proper roles and audit trail — so arranging the canvas never touches the frozen
v1 export contract.

## Requirements

### Requirement: Layout endpoints

The API MUST expose `GET /api/projects/:id/diagram` returning the saved layout
document `{ projectId, zones, layouts }` — one `layouts` entry per zone with
its `positions`, `viewport` and `zoom` — and `PUT /api/projects/:id/diagram`
replacing it. The PUT accepts that zone document or the legacy flat layout
(`positions`, `viewport`, `zoom`), which is stored as zone `Principal`. An
unknown project MUST return `404` with the standard error envelope and change
nothing.

#### Scenario: Save and read back

- **WHEN** a `MEMBER` PUTs a layout and then GETs it
- **THEN** the response carries exactly the positions, viewport and zoom that were sent, inside the `layouts` entry of their zone

#### Scenario: Legacy flat layout is accepted

- **WHEN** a `MEMBER` PUTs the flat document without `zones` and then GETs it
- **THEN** the layout is stored for zone `Principal` and `zones` lists `Principal` holding every table of the model

#### Scenario: Unknown project is rejected

- **WHEN** either endpoint is called with a project id that does not exist
- **THEN** the response is `404` with the standard error envelope and no row is written

### Requirement: Layout keyed by table name

Layout positions MUST be keyed by table name, never by internal ids — internal
ids are regenerated on every model save. Saved positions for names absent from
the model MUST be ignored on read.

#### Scenario: Layout survives a model save

- **WHEN** the model is saved (regenerating internal ids) and the diagram reopens
- **THEN** every card still renders at its previously saved position

#### Scenario: Positions for removed tables are ignored

- **WHEN** the saved layout contains a name no longer present in the model
- **THEN** the GET response omits it or the client ignores it, without error

### Requirement: Layout roles

`GET /api/projects/:id/diagram` MUST be available to any authenticated caller;
`PUT /api/projects/:id/diagram` MUST require `MEMBER` or `ADMIN`, and a
`VIEWER` MUST receive `403` with the error envelope leaving the stored layout
unchanged.

#### Scenario: Viewer cannot write the layout

- **WHEN** a `VIEWER` calls the layout PUT
- **THEN** the response is `403` with the error envelope
- **AND** the stored layout is unchanged

### Requirement: Layout save is audited

A successful layout PUT MUST append an `events` row with action
`diagram.layout_saved`, the acting user and the project id, in the same
transaction as the write; a failed write MUST NOT leave an event.

#### Scenario: Layout save is recorded

- **WHEN** a `MEMBER` saves a diagram layout
- **THEN** an `events` row exists with action `diagram.layout_saved`, the actor id and the project id

#### Scenario: Failed write leaves no event

- **WHEN** the layout write fails and rolls back
- **THEN** no `diagram.layout_saved` event is appended

### Requirement: Layout stays out of the v1 export

The v1 export response MUST remain byte-compatible with the frozen contract —
no layout field may appear in it, regardless of how much layout data is saved.

#### Scenario: Export is unaffected by saved layout

- **WHEN** a project with a saved layout is exported
- **THEN** the export body contains only the `database` contract keys
- **AND** no `diagram` or layout key appears anywhere in the payload

### Requirement: Automatic layout options

The diagram MUST offer automatic organization with at least two algorithms:
`Em grade` (rows and columns, current behavior) and `Em estrela` (most connected
table at the center, the others arranged in rings by relationship level, with
unrelated tables placed in a side strip). Both MUST be deterministic for the
same model, MUST NOT overlap cards, and MUST respect a minimum gap between
cards.

#### Scenario: Grid layout arranges all cards

- **WHEN** a `MEMBER` applies `Em grade`
- **THEN** every table of the active zone is placed on a regular grid without overlap
- **AND** repeating the action produces the same positions

#### Scenario: Star layout centers the hub

- **WHEN** a `MEMBER` applies `Em estrela` on a zone where `alocacao` has the most connections
- **THEN** `alocacao` is placed at the center
- **AND** its direct neighbors form the first ring
- **AND** tables with no relationship are placed in a side strip

#### Scenario: Overlap is prevented

- **WHEN** two tables have similar names and the same connection level
- **THEN** their cards do not overlap

### Requirement: Automatic layout is persisted like a manual arrangement

Applying an automatic layout MUST persist the resulting positions, the viewport
and the zoom through the existing layout endpoint in a single write, auditing
exactly one save, and MUST fit the view to the arranged cards afterwards. A
`VIEWER` MUST NOT be able to apply an automatic layout.

#### Scenario: One write per layout application

- **WHEN** a `MEMBER` applies `Em estrela`
- **THEN** one layout save is sent with the new positions
- **AND** exactly one layout save event is appended

#### Scenario: View is fitted after organizing

- **WHEN** the automatic layout finishes
- **THEN** the viewport is fitted to the arranged cards

#### Scenario: Viewer cannot reorganize

- **WHEN** a `VIEWER` opens the diagram
- **THEN** the automatic layout actions are not available and no save is sent
