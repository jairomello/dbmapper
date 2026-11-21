# diagram-canvas Specification

## Purpose
Render the project's data model as an interactive ER canvas inside the
authenticated workspace: table cards, relationship edges, selection
synchronization with the semantic tree, search highlighting, and faithful
application of the persisted layout.

## Requirements

### Requirement: Diagram view in the workspace

The workspace MUST offer an `Editor`/`Diagrama` view switch over the main
content area. Activating `Diagrama` MUST replace the metadata editor with the
canvas while the semantic tree, header and status bar remain visible and
functional; the metadata editor MUST remain reachable as a collapsible panel
that opens on selection. Switching back MUST restore the editor view with the
current selection intact.

#### Scenario: Switching to the diagram keeps the workspace chrome

- **WHEN** the user activates the `Diagrama` view in a project workspace
- **THEN** the canvas is displayed in the main area
- **AND** the semantic tree, header and status bar are still visible and interactive
- **AND** the status bar metrics still match the model

#### Scenario: Selection opens the editor panel in diagram mode

- **WHEN** the user selects any item while in `Diagrama` view
- **THEN** the metadata editor becomes visible as a panel without leaving the diagram

#### Scenario: Switching back restores the editor

- **WHEN** the user activates the `Editor` view
- **THEN** the metadata editor shows the item that was last selected

### Requirement: Model rendered as ER canvas

The canvas MUST render every non-`REMOVED` table as a card showing its name,
columns in model order with primary-key and foreign-key marks, and MUST render
each relationship as an edge between the two table cards. A table with no saved
position MUST be placed automatically in a deterministic position so it is
always visible.

#### Scenario: Tables and columns are visible

- **WHEN** a project with two tables and one relationship opens in the diagram
- **THEN** one card per table is rendered with its columns in model order
- **AND** an edge connects the two cards for the relationship

#### Scenario: A newly imported table appears without manual layout

- **WHEN** a project opens whose tables have no saved layout
- **THEN** every table card is placed automatically within the visible canvas area

### Requirement: Selection synchronization

Selecting a table or column on the canvas MUST update the shared selection so
the tree highlights it and the editor shows it; selecting an item in the tree
MUST highlight the corresponding card and bring it into view.

#### Scenario: Canvas selection drives the tree and editor

- **WHEN** the user clicks a table card in the canvas
- **THEN** that table becomes the active item in the tree
- **AND** the editor panel shows the table

#### Scenario: Tree selection highlights the card

- **WHEN** the user selects a column in the semantic tree while in diagram view
- **THEN** the card containing that column is highlighted and scrolled into view

### Requirement: Search highlights matches

The diagram view MUST offer a search field that highlights the tables and
columns matching the query. Non-matching nodes MUST remain visible on the
canvas — search never removes or hides nodes.

#### Scenario: Matches are highlighted, nothing disappears

- **WHEN** the user types a query matching one table name
- **THEN** that table's card is highlighted
- **AND** all other cards remain visible and unhighlighted

### Requirement: Viewer role sees a read-only diagram

A `VIEWER` MUST see the diagram like any other user, but dragging cards MUST
be disabled and MUST NOT trigger any layout write.

#### Scenario: Viewer cannot move cards

- **WHEN** a `VIEWER` attempts to drag a table card
- **THEN** the card does not move
- **AND** no layout request is sent

### Requirement: Saved layout is applied on open

When the diagram opens, saved positions, pan and zoom MUST be applied; saved
entries whose table name no longer exists in the model MUST be ignored without
error.

#### Scenario: Reopening restores the view

- **WHEN** a user who previously arranged tables reopens the diagram
- **THEN** cards render at their saved positions with the saved zoom

#### Scenario: Stale entries are ignored

- **WHEN** the saved layout references a table that was removed or renamed
- **THEN** the diagram opens normally and the stale entry is ignored

### Requirement: Diagram export to image files

The diagram view MUST offer export actions producing a PNG and an SVG file of
the current diagram — cards with their columns and relationship edges — using
client-side rendering; export MUST NOT modify the model, the layout or the
server state.

#### Scenario: PNG download

- **WHEN** the user clicks the PNG export action
- **THEN** a PNG file of the visible diagram is downloaded

#### Scenario: SVG download

- **WHEN** the user clicks the SVG export action
- **THEN** an SVG file containing the cards and edges is downloaded

#### Scenario: Export has no side effects

- **WHEN** either export completes
- **THEN** no save request is sent and the layout is unchanged

### Requirement: Table count in the diagram header

The diagram view MUST show the number of tables in the current model in its
header area, updated whenever the model changes.

#### Scenario: Count matches the model

- **WHEN** a project with 8 non-removed tables opens in the diagram
- **THEN** the header shows `8 tabelas`
