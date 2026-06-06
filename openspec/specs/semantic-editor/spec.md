# semantic-editor Specification

## Purpose
Loads the currently selected database, table, or column from `project-persistence` into a per-item editor where the user can write a description, manage business terms as chips, and approve or reopen review. For tables, the editor also renders a "Filha de" / "Mãe de" relationships panel that links to related tables. Editing an approved description automatically reopens review so the change is visible in the sidebar; persisting edits writes back to `projectData` and re-renders the tree.
## Requirements
### Requirement: Selection of an item

The editor MUST open when the user selects the database root, a table, or a column from the sidebar tree.

#### Scenario: Selecting the database
- **WHEN** the user clicks the database root name or the database name in the status bar
- **THEN** the editor MUST become visible
- **AND** the editor title MUST be the database name
- **AND** the breadcrumb MUST read `Banco de Dados`

#### Scenario: Selecting a table
- **WHEN** the user clicks a non-`REMOVED` table name
- **THEN** the editor MUST become visible
- **AND** the editor title MUST be the table name
- **AND** the breadcrumb MUST read `Tabela`
- **AND** the relationships section MUST become visible for that table

#### Scenario: Selecting a column
- **WHEN** the user clicks a column name in a non-collapsed table
- **THEN** the editor MUST become visible
- **AND** the editor title MUST be the column name
- **AND** the breadcrumb MUST read `Coluna`
- **AND** the relationships section MUST be hidden

### Requirement: Description editing

The editor MUST load the selected item's current description into a textarea, persist edits back to the item on save, and re-render the sidebar to reflect any change in semantic status.

#### Scenario: Loading the description
- **WHEN** an item is selected
- **THEN** the textarea MUST show the item's current `description` (or an empty string)

#### Scenario: Saving a description
- **WHEN** the user clicks "Salvar Alterações" after editing the textarea
- **THEN** the item's `description` MUST equal the new value
- **AND** a `M.toast` MUST show `Alterações salvas temporariamente.`
- **AND** the tree MUST re-render so the semantic badge reflects the new state

#### Scenario: Editing an approved description reopens review
- **WHEN** the user types into the textarea while the item is `reviewed: true`
- **THEN** the `reviewed` flag MUST be reset to `false` at save time so the change is visible in the sidebar

### Requirement: Business terms editing

The editor MUST show the selected item's `business_terms` as chips and let the user add or remove terms; on save, the resulting list MUST be persisted back to the item.

#### Scenario: Loading terms
- **WHEN** an item is selected
- **THEN** the chips input MUST show one chip per entry in `business_terms`

#### Scenario: Adding a term
- **WHEN** the user types a term and presses Enter in the chips input
- **THEN** a new chip MUST appear in the list

#### Scenario: Saving terms
- **WHEN** the user clicks "Salvar Alterações" after editing the chips
- **THEN** the item's `business_terms` MUST equal the resulting chip data

### Requirement: Review action

The editor MUST expose an "Aprovar Descrição" / "Reabrir Revisão" button that toggles the item's `reviewed` flag, gated on the description being non-empty.

#### Scenario: Approving a described item
- **WHEN** the user clicks "Aprovar Descrição" on an item that has a non-empty description
- **THEN** the item's `reviewed` flag MUST become `true`
- **AND** a `M.toast` MUST show `Descrição aprovada.`
- **AND** the button label MUST switch to `Reabrir Revisão`

#### Scenario: Reopening an approved item
- **WHEN** the user clicks "Reabrir Revisão" on an item that is `reviewed: true`
- **THEN** the item's `reviewed` flag MUST become `false`
- **AND** a `M.toast` MUST show `Descrição reaberta para revisão.`

#### Scenario: Approving with an empty description
- **WHEN** the user clicks the review button while the textarea is empty or only whitespace
- **THEN** the system MUST surface a `M.toast` with the message `Preencha a descrição antes de aprovar.`
- **AND** the `reviewed` flag MUST remain `false`

#### Scenario: Button is disabled while description is empty
- **WHEN** the textarea is empty or only whitespace
- **THEN** the review button MUST be disabled

### Requirement: Table relationships panel

When a table is selected, the editor MUST render two lists of relationships: "Filha de" (parents) and "Mãe de" (children), each item linking to the related table.

#### Scenario: Parents list is shown
- **WHEN** a table is selected
- **THEN** the "Filha de" section MUST list every relationship in `table.relationships.parents`
- **AND** each entry MUST show `local_columns → referenced_table.referenced_columns`

#### Scenario: Children list is shown
- **WHEN** a table is selected
- **THEN** the "Mãe de" section MUST list every relationship in `table.relationships.children`
- **AND** each entry MUST show `local_columns ← referenced_table.referenced_columns`

#### Scenario: Clicking a related table name selects it
- **WHEN** the user clicks a related table name inside the relationships panel
- **THEN** the editor MUST switch to that table
- **AND** the tree MUST mark that table as the active item

#### Scenario: No relationships
- **WHEN** a selected table has empty `parents` or `children` arrays
- **THEN** the corresponding list MUST show the message `Nenhum relacionamento identificado.`

#### Scenario: Panel is hidden for non-table items
- **WHEN** the selected item is the database or a column
- **THEN** the relationships section MUST be hidden

### Requirement: Capability Purpose paragraph
The `## Purpose` section of this spec MUST describe the capability in 1–3 behavior-oriented sentences, must NOT contain the placeholder `TBD - created by archiving`, and MUST name the executable test script (if any) and the cross-cutting `project-persistence` contract (if relevant).

#### Scenario: Purpose paragraph is non-placeholder
- **WHEN** a reader opens this spec file
- **THEN** the `## Purpose` section MUST NOT contain the string `TBD - created by archiving`
- **AND** the section MUST contain at least one complete sentence describing the capability's user-facing responsibility

### Requirement: Page is served under the static-site-security controls

The page that hosts this capability (`dbmapper.html`) MUST be served with the SRI, CSP, and "no inline scripts/handlers" controls defined in the `static-site-security` specification.

#### Scenario: Page is served under static-site-security

- **WHEN** `dbmapper.html` is loaded
- **THEN** the page MUST satisfy every `Requirement` of the `static-site-security` capability (SRI on every CDN resource including the Materialize CSS and JS at version `1.0.0` on cdnjs, a `<meta http-equiv="Content-Security-Policy">` in the head, no inline `<script>` or `<style>` block, no `on*=` handlers, and external CSS/JS in standalone files)

