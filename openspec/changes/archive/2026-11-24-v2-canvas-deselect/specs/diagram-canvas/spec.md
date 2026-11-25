## ADDED Requirements

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
