# Spec Delta

## ADDED Requirements

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
