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

### Requirement: Canvas toolbar

The diagram view MUST expose a toolbar with: a `Selecionar` mode (default) and
a `Mover` mode that pans the canvas without changing the selection; zoom in,
zoom out and fit-to-view; create table and create relationship; automatic
layout; and the PNG/SVG export actions. Toolbar controls MUST have accessible
labels and reflect the active mode. A `VIEWER` MUST see only navigation, zoom,
fit and export actions.

#### Scenario: Pan mode does not select

- **WHEN** the user activates `Mover` and drags the empty canvas
- **THEN** the viewport pans and the current selection is unchanged

#### Scenario: Select mode is the default

- **WHEN** the diagram opens
- **THEN** `Selecionar` is active and clicking a card selects it

#### Scenario: Viewer sees no editing controls

- **WHEN** a `VIEWER` opens the diagram
- **THEN** create table, create relationship and automatic layout are not rendered
- **AND** zoom, fit and export remain available

### Requirement: Related edges are emphasized on selection

When a table is selected, its card and every edge touching it MUST be
emphasized while unrelated cards and edges are visually muted. The emphasis MUST
apply both when the table is selected on the canvas and when it is selected in
the semantic tree.

#### Scenario: Selecting a table highlights its edges

- **WHEN** the user selects `alocacao` on the canvas
- **THEN** all edges with an endpoint on `alocacao` are emphasized
- **AND** edges between two other tables are muted

#### Scenario: Selection from the tree has the same effect

- **WHEN** the user selects a table in the semantic tree while the diagram is open
- **THEN** the card and its edges are emphasized exactly as on canvas selection

### Requirement: Edge direction is distinguishable

Emphasized edges MUST distinguish the two directions: relationships where the
selected table holds the foreign key (it references another table) MUST use one
color and a dashed pattern, and relationships where other tables reference the
selected one MUST use another color and a distinct pattern, so direction is
readable without relying on color alone. Color and pattern MUST remain legible
in the light theme.

#### Scenario: Outgoing and incoming use different styles

- **WHEN** `alocacao` references `projeto` and `async_job` references `alocacao`
- **THEN** the `alocacao → projeto` edge and the `async_job → alocacao` edge have different colors and dash patterns

#### Scenario: Direction is readable without color

- **WHEN** a color-blind user inspects the two emphasized edges
- **THEN** the dash patterns and the cardinality marks still distinguish them

### Requirement: Animated flow shows the foreign-key direction

On emphasized edges the dash MUST animate from the table that owns the foreign
key toward the referenced table, so the reader can follow the relationship
direction. When the user prefers reduced motion, the dash MUST stay static.

#### Scenario: Flow animates toward the referenced table

- **WHEN** an emphasized edge is rendered for a table holding the foreign key
- **THEN** the dash animation flows from that table to the referenced one

#### Scenario: Reduced motion is respected

- **WHEN** the system prefers reduced motion
- **THEN** no dash animation is applied and the edge stays fully readable

### Requirement: Edge weight

Relationship edges MUST render with at least 2 px stroke in the default state
and thicker (3 px) when emphasized, with the cardinality marks scaled
proportionally, without obscuring the column names at the initial zoom.

#### Scenario: Edges are legible at the default zoom

- **WHEN** a project opens at its saved or fitted zoom
- **THEN** every edge stroke is 2 px or more and its cardinality marks are visible

#### Scenario: Emphasis increases weight

- **WHEN** an edge becomes emphasized
- **THEN** its stroke grows to 3 px and returns to 2 px when the selection clears
