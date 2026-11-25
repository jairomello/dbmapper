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

### Requirement: Card content is never clipped

A table card MUST reserve internal space for the header, the column list and the
relationship footer, and MUST never clip content at its sides or bottom: when the
card is shorter than its content, the column area MUST scroll instead of being
cut. Card content MUST keep a consistent inner padding.

#### Scenario: Footer is visible on open

- **WHEN** a table with foreign keys opens in the diagram
- **THEN** its relationship footer is fully visible, not cut by the card height

#### Scenario: Short card scrolls its columns

- **WHEN** a card is resized shorter than its column list
- **THEN** the column area scrolls vertically
- **AND** the header and the footer stay visible

#### Scenario: Connection handles are fully visible

- **WHEN** a column row renders its connection dot
- **THEN** the dot is fully inside the card, with a small margin from the border
- **AND** the row label keeps a gap from the dot and from the action buttons

### Requirement: Resizable table cards

With a card selected, a `MEMBER` MUST be able to resize it by dragging handles on
its edges and corners, within a minimum width and height. A `VIEWER` MUST NOT see
or use resize handles. Resizing MUST NOT trigger a model write.

#### Scenario: Resize handles appear on the selected card

- **WHEN** a `MEMBER` selects a table card
- **THEN** resize handles appear on its edges and corners
- **AND** no handles appear on unselected cards

#### Scenario: Resize is restricted to editors

- **WHEN** a `VIEWER` selects a card
- **THEN** no resize handles are rendered and no layout save is sent

#### Scenario: Minimum size is enforced

- **WHEN** the user drags a handle below the minimum width or height
- **THEN** the card stops at the minimum size

### Requirement: Card size is stored per zone

The card's width and height MUST be persisted in the active zone's layout
document alongside its position, so the same table MAY have different sizes on
different zone tabs and each tab restores its own size. Layouts saved without a
size MUST fall back to the default card size without error.

#### Scenario: Different sizes per zone

- **WHEN** the same table is resized on zone `Financeiro` and the diagram switches to `Principal`
- **THEN** `Principal` shows that table at its own size
- **AND** returning to `Financeiro` restores the resized card

#### Scenario: Legacy layout keeps working

- **WHEN** a layout saved before this change (only positions) is opened
- **THEN** cards render at the default size without errors

### Requirement: Collapsible relationship sections

The relationship footer of a card MUST expose each section ("Chaves entre
modelos" and "Chaves estrangeiras") as a collapsible accordion, with the
expanded/collapsed state reflected in an accessible control.

#### Scenario: Collapsing the foreign keys

- **WHEN** the user collapses "Chaves estrangeiras" on a card
- **THEN** its rows are hidden and the column area gains the freed space
- **AND** the control reports the collapsed state to assistive technology

#### Scenario: Expanding restores the rows

- **WHEN** the user expands the section again
- **THEN** the rows are shown again without changing the model

### Requirement: Zoom range fits large models

The diagram's minimum zoom MUST allow fitting a model of several thousand pixels
of extent into the visible canvas, and the fit action MUST honor that range. The
current zoom level MUST remain readable through the existing zoom controls.

#### Scenario: Large model fits the canvas

- **WHEN** a zone's arranged cards span about six thousand pixels
- **THEN** "Ajustar à tela" fits the whole arrangement inside the visible canvas

#### Scenario: Zoom out goes further than before

- **WHEN** the user repeatedly zooms out
- **THEN** the view can reach at least four times the previous minimum zoom-out level

### Requirement: Minimap legibility

The minimap MUST keep the whole arrangement legible for large models: it MUST be
large enough to show card shapes, distinguish the selected/highlighted cards from
the rest, and indicate the visible viewport without hiding the arrangement.

#### Scenario: Selected card stands out in the minimap

- **WHEN** a table is selected on a large diagram
- **THEN** its minimap node is visually distinct from the others

#### Scenario: Minimap shows the whole arrangement

- **WHEN** a zone with more than one hundred cards is organized
- **THEN** the minimap shows the whole arrangement inside its bounds

### Requirement: Optional direct-neighbor focus
The diagram MUST offer an optional focus on a selected table and its direct relationships, with a control to return to the complete active zone. Focus MUST NOT change persisted positions, memberships, viewport or model.

#### Scenario: Enter and leave focus
- **WHEN** the user focuses a selected table
- **THEN** the table and its direct neighbors and relationships are shown
- **AND** returning to the complete zone restores the previous view

#### Scenario: Focus is read only
- **WHEN** a VIEWER uses focus
- **THEN** no layout or model write is sent

### Requirement: Diagram detail levels
The diagram MUST allow a compact presentation showing table names and relationship endpoints and a detailed presentation exposing all columns in model order. Detail changes MUST preserve selectable columns and unambiguous relationship endpoints through an accessible path to the detailed presentation.

#### Scenario: Inspect a hidden column
- **WHEN** a user selects a column from search or the tree while its card is compact
- **THEN** the column becomes visible and selected in the corresponding card

### Requirement: Metadata panel alongside diagram
The diagram MUST provide a collapsible metadata panel alongside the canvas when space permits and an accessible alternative for narrower screens. Selection MUST remain synchronized across tree, diagram and panel.

#### Scenario: Select a column
- **WHEN** a user selects a column in the diagram
- **THEN** its metadata appears in the panel without leaving the diagram
- **AND** its selected state is visible in the tree

### Requirement: Clear the selection from the canvas

Clicking an empty area of the diagram pane MUST clear the current table or
column selection by returning to the database root selection. The cards MUST
lose their highlight, the semantic tree MUST highlight the database row, and, in
the workspace diagram mode, the item panel MUST close. Dragging a card MUST be
possible from its whole header (excluding action buttons), not only from a small
grip, and MUST remain unavailable to a `VIEWER`.

#### Scenario: Empty canvas click clears the table selection

- **WHEN** a table is selected and the user clicks an empty part of the canvas
- **THEN** the table card is no longer highlighted
- **AND** the selection returns to the project database
- **AND** the item panel closes

#### Scenario: Dragging starts from the card header

- **WHEN** a `MEMBER` presses and drags the header of a card
- **THEN** the card moves and the new position is persisted
- **AND** clicking the table name still selects the table

#### Scenario: Viewer cannot drag

- **WHEN** a `VIEWER` drags a card header
- **THEN** no position or layout write happens

### Requirement: Temporary pan mode with Ctrl

While the Ctrl key is held, the diagram MUST behave as the **Mover** tool: dragging
the canvas pans the view and table cards MUST NOT be dragged, even when the drag
starts over a card. Releasing Ctrl MUST restore the previous tool behavior
(default **Selecionar**) without requiring a click. Losing window focus or
switching tabs MUST release the temporary mode.

#### Scenario: Ctrl enables pan while held

- **WHEN** a `MEMBER` holds Ctrl and drags on the canvas
- **THEN** the viewport pans instead of moving a table card

#### Scenario: Releasing Ctrl restores card dragging

- **WHEN** the user releases Ctrl
- **THEN** dragging a card header moves the card again
- **AND** the active toolbar tool is unchanged

#### Scenario: Focus loss resets the modifier

- **WHEN** the window loses focus while Ctrl is held
- **THEN** the temporary pan mode is turned off

### Requirement: Temporary pan mode feedback

While the Ctrl key (left or right) is held, the toolbar MUST present **Mover** as
pressed and **Selecionar** as not pressed, without changing the tool that is
restored on release. The pane and cards MUST show a grab cursor in that mode and
a grabbing cursor while the canvas is being dragged. Interactive areas (toolbar,
controls, minimap, menus, dialogs and form fields) MUST NOT start the temporary
pan when pressed.

#### Scenario: Toolbar reflects the temporary mode

- **WHEN** the user holds Ctrl on either side
- **THEN** **Mover** is pressed in the toolbar and **Selecionar** is not

#### Scenario: Releasing restores the toolbar state

- **WHEN** the user releases Ctrl
- **THEN** **Selecionar** is pressed again (unless **Mover** was chosen explicitly)

#### Scenario: Cursor indicates the mode

- **WHEN** Ctrl is held over the pane or a card
- **THEN** the cursor is `grab`
- **AND** while dragging the canvas it becomes `grabbing`

#### Scenario: Interactive controls keep working

- **WHEN** the user presses Ctrl on the toolbar, minimap, controls, a menu or a
  form field
- **THEN** the canvas does not start panning

### Requirement: Wheel zoom and scrolling

The mouse wheel MUST scroll the canvas vertically when no modifier is held, and
horizontally when Shift is held, without changing the zoom. With Ctrl held, the
wheel MUST zoom around the cursor position. Ctrl MUST take precedence over Shift.
Wheel events over scrollable content inside a card MUST keep scrolling that
content instead of moving the canvas.

#### Scenario: Plain wheel scrolls vertically

- **WHEN** the user scrolls the wheel over the canvas without Ctrl or Shift
- **THEN** the viewport moves vertically
- **AND** the zoom level is unchanged

#### Scenario: Shift + wheel scrolls horizontally

- **WHEN** the user holds Shift and scrolls the wheel over the canvas
- **THEN** the viewport moves horizontally
- **AND** the zoom level is unchanged

#### Scenario: Ctrl + wheel zooms around the cursor

- **WHEN** the user holds Ctrl and scrolls the wheel over the canvas
- **THEN** the zoom changes at the cursor position
- **AND** Ctrl+Shift keeps this zoom behavior

#### Scenario: Scrollable card content keeps its scroll

- **WHEN** the wheel is used over a scrollable column list inside a card
- **THEN** that list scrolls
- **AND** the canvas viewport does not move
