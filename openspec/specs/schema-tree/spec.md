# schema-tree Specification

## Purpose
Renders the sidebar tree of `database → tables → columns` from the in-memory `projectData` produced by `project-persistence`. Every item carries a semantic status badge (`sem desc` / `revisar` / `aprovado`) and, where applicable, a change badge (`novo` / `renomeado` / `tipo` / `removido`). The tree also handles per-table collapse, a collapse-all/expand-all toggle on the database root, and the active-item highlight that ties the sidebar to the editor.
## Requirements
### Requirement: Database root node

The schema tree MUST render a single root node for the database itself, displayed at the top of the tree, with the database name as its label.

#### Scenario: Database root renders on load
- **WHEN** `projectData.database` has a name and a list of tables
- **THEN** the tree MUST show a top-level item whose label is the database name and whose icon is `storage`

#### Scenario: Database root is selectable
- **WHEN** the user clicks the database name
- **THEN** the editor MUST open with the database selected
- **AND** the database node MUST be marked as the active item

#### Scenario: Database name in the status bar mirrors the project
- **WHEN** `projectData.database.name` changes
- **THEN** the `#sb-db-label` element in the status bar MUST show the updated name

### Requirement: Table nodes with change badges

The tree MUST render one node per table in the project, with a badge that reflects the table's `status` field.

#### Scenario: New table badge
- **WHEN** a table has `status: "NEW"`
- **THEN** the table node MUST display a `novo` badge with the `tree-badge-new` class

#### Scenario: Renamed table badge
- **WHEN** a table has `status: "RENAMED"`
- **THEN** the table node MUST display a `renomeado` badge with the `tree-badge-changed` class

#### Scenario: Removed table is rendered but non-interactive
- **WHEN** a table has `status: "REMOVED"`
- **THEN** the tree MUST still display the table name
- **AND** the node MUST show a `removido` badge with the `tree-badge-removed` class
- **AND** the node MUST NOT show a chevron, MUST NOT show a review action button, and MUST NOT be clickable for selection

#### Scenario: Unchanged table has no change badge
- **WHEN** a table has `status: "UNCHANGED"`
- **THEN** the table node MUST NOT show a `novo`, `renomeado`, or `removido` badge

### Requirement: Column nodes with change badges

For every non-`REMOVED` table, the tree MUST render one node per column, with a badge that reflects the column's `status` field, and the column type shown alongside the column name.

#### Scenario: New column badge
- **WHEN** a column has `status: "NEW"`
- **THEN** the column node MUST display a `novo` badge with the `tree-badge-new` class

#### Scenario: Changed-type column badge
- **WHEN** a column has `status: "CHANGED"`
- **THEN** the column node MUST display a `tipo` badge with the `tree-badge-changed` class

#### Scenario: Column type is shown
- **WHEN** a column is rendered
- **THEN** the column type string MUST appear next to the column name with the `tree-item-type` class

### Requirement: Semantic status badge per item

Every item in the tree (database, table, column) MUST display a semantic status badge that reflects whether it has a description and whether that description has been reviewed.

#### Scenario: No description
- **WHEN** an item has no description or a description that is only whitespace
- **THEN** the item MUST display a `sem desc` badge with the `tree-semantic-badge is-missing` class

#### Scenario: Description filled, not yet reviewed
- **WHEN** an item has a non-empty description and `reviewed: false`
- **THEN** the item MUST display a `revisar` badge with the `tree-semantic-badge is-review` class

#### Scenario: Description filled and reviewed
- **WHEN** an item has a non-empty description and `reviewed: true`
- **THEN** the item MUST display a `aprovado` badge with the `tree-semantic-badge is-approved` class

### Requirement: Inline review toggle per item

Every item in the tree MUST expose a small button that toggles its `reviewed` flag without opening the editor.

#### Scenario: Toggle on a described item
- **WHEN** the user clicks the review button on a non-`REMOVED` table or column that has a description
- **THEN** the item's `reviewed` flag MUST flip
- **AND** the tree MUST re-render to reflect the new semantic badge

#### Scenario: Toggle on an undescribed item
- **WHEN** the user clicks the review button on an item whose description is empty
- **THEN** the system MUST surface a `M.toast` with the message `Preencha a descrição antes de aprovar.`
- **AND** the `reviewed` flag MUST remain `false`

### Requirement: Per-table collapse state

The tree MUST let the user collapse and expand each table's column list, and the collapse state MUST be kept in memory only (not persisted to JSON).

#### Scenario: Chevron toggles a single table
- **WHEN** the user clicks the chevron on a non-`REMOVED` table
- **THEN** that table's columns MUST be hidden
- **AND** the chevron icon MUST rotate to the collapsed state

#### Scenario: Clicking again expands the table
- **WHEN** the user clicks the chevron on a previously collapsed table
- **THEN** that table's columns MUST be shown again

#### Scenario: Collapse state is reset on import and on project open
- **WHEN** the user imports a new SQL or opens a new JSON project
- **THEN** every table MUST start expanded

### Requirement: Collapse-all / expand-all

The tree MUST expose a single icon on the database root that collapses every table if any are expanded, and expands every table if all are collapsed.

#### Scenario: All expanded → click collapses all
- **WHEN** every active table is expanded and the user clicks the database root's collapse-all icon
- **THEN** every active table MUST collapse

#### Scenario: All collapsed → click expands all
- **WHEN** every active table is collapsed and the user clicks the database root's collapse-all icon
- **THEN** every active table MUST expand

#### Scenario: Mixed state → click collapses all
- **WHEN** some tables are expanded and others are collapsed and the user clicks the collapse-all icon
- **THEN** every active table MUST collapse

### Requirement: Active item highlight

The tree MUST visually mark the currently selected item (database, table, or column) so the user can see which item is loaded in the editor.

#### Scenario: Selected item gets the active class
- **WHEN** an item is selected via the tree
- **THEN** that item's node MUST have the `is-active` class
- **AND** no other node in the same tree MUST have the `is-active` class

### Requirement: Capability Purpose paragraph
The `## Purpose` section of this spec MUST describe the capability in 1–3 behavior-oriented sentences, must NOT contain the placeholder `TBD - created by archiving`, and MUST name the executable test script (if any) and the cross-cutting `project-persistence` contract (if relevant).

#### Scenario: Purpose paragraph is non-placeholder
- **WHEN** a reader opens this spec file
- **THEN** the `## Purpose` section MUST NOT contain the string `TBD - created by archiving`
- **AND** the section MUST contain at least one complete sentence describing the capability's user-facing responsibility

