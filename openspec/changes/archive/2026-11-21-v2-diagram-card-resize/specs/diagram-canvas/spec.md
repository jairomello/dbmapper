# Spec Delta

## ADDED Requirements

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
