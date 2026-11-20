# Spec Delta

## Purpose

Group a project's tables into named zones (tabs) on the diagram, each with its
own saved layout, and expose the split between relationships that cross zones
and those that stay inside one — persisted atomically in the existing layout
document without new routes or audit actions.

## ADDED Requirements

### Requirement: Zone tabs

The diagram view MUST show a tab bar with the active zone and a `+` action to
create a zone by name. Zones MUST be renameable, reorderable by drag, and
deletable with confirmation; deleting a zone moves its tables to `Principal`,
and `Principal` MUST NOT be deletable.

#### Scenario: Creating a zone

- **WHEN** a `MEMBER` clicks `+` and confirms a zone name
- **THEN** a new tab appears and becomes the active zone

#### Scenario: Deleting a zone returns its tables

- **WHEN** a `MEMBER` deletes a non-default zone containing tables
- **THEN** its tables belong to `Principal` again and remain in the model

#### Scenario: Default zone is protected

- **WHEN** the user inspects the delete action for `Principal`
- **THEN** it is not available

### Requirement: Table assignment to zones

Every table MUST belong to at most one zone. Newly created or imported tables
MUST land in `Principal`. Moving a table to another zone MUST update the
assignment without changing the model. A table MAY belong to no zone: it then
remains in the model and in the semantic tree but is rendered on no zone tab.

#### Scenario: Moving a table between zones

- **WHEN** a `MEMBER` moves `cidade` from `Principal` to zone `Geografia`
- **THEN** `cidade` appears only on the `Geografia` tab and disappears from `Principal`

#### Scenario: New tables land in the default zone

- **WHEN** a table is created or a model is imported
- **THEN** it belongs to `Principal`

#### Scenario: A table can stay outside every zone

- **WHEN** a table is removed from its zone
- **THEN** it still exists in the model and in the semantic tree
- **AND** it is rendered on no zone tab

### Requirement: Adding tables to the diagram by dragging from the tree

Dragging a table from the semantic tree onto the active zone's canvas MUST add
it to that zone at the drop position (and move it out of its previous zone, if
any). Dropping a table that already belongs to the active zone MUST only move
its card. Dragging MUST be unavailable to a `VIEWER`.

#### Scenario: Drop adds the table to the active zone

- **WHEN** a `MEMBER` drags `cidade` from the tree and drops it on the `Geografia` canvas
- **THEN** `cidade` belongs to `Geografia` and its card is placed at the drop position
- **AND** the tree reflects that the table is now part of `Geografia`

#### Scenario: Dropping an existing table repositions it

- **WHEN** a `MEMBER` drops a table that already belongs to the active zone
- **THEN** only its position changes and the membership stays as it was

#### Scenario: Viewer cannot drag tables in

- **WHEN** a `VIEWER` tries to drag a table from the tree onto the canvas
- **THEN** no membership or layout change is persisted

### Requirement: Removing a table from the diagram without deleting it

The canvas MUST offer a "Remover do diagrama" action per card that removes the
table from its zone while keeping it in the model and in the semantic tree; the
action MUST NOT be confused with deleting a table, and the confirmation copy
MUST state that the table is kept in the dictionary. Adding it back MUST be
possible by dragging from the tree.

#### Scenario: Removing keeps the table in the model

- **WHEN** a `MEMBER` removes `cidade` from the diagram
- **THEN** `cidade` no longer appears on any zone tab
- **AND** the table, its columns and its relationships are unchanged in the model
- **AND** the tree still lists `cidade` (marked as outside the diagram)

#### Scenario: Removing does not change the model

- **WHEN** the removal save completes
- **THEN** the model payload is identical to the previous one, except for the layout document

### Requirement: Locate a table from the semantic tree

Selecting a table or column in the semantic tree while the diagram is open MUST
bring that card into view: if the table belongs to a zone other than the active
one, the diagram MUST switch to that zone first and then center the card. A
table outside every zone MUST offer "Adicionar à aba atual" to a `MEMBER`
instead of silently doing nothing.

#### Scenario: Locating a table from another zone

- **WHEN** a user selects a table that belongs to `Geografia` while `Principal` is active
- **THEN** the diagram switches to `Geografia` and centers the card
- **AND** the card is highlighted

#### Scenario: Locating a table with no zone

- **WHEN** a user selects a table that belongs to no zone
- **THEN** the canvas does not change zone and offers to add the table to the active zone

### Requirement: Layout is saved per zone

Switching zones MUST restore that zone's saved positions, viewport and zoom;
arranging tables in one zone MUST NOT alter another zone's layout.

#### Scenario: Each zone keeps its own arrangement

- **WHEN** a user arranges tables in `Geografia` and switches to `Principal`
- **THEN** `Principal` shows its own saved arrangement unchanged

### Requirement: Cross-zone keys are derived

Relationships whose two tables are in different zones MUST be listed in the
card's "Chaves entre modelos" strip; relationships inside one zone MUST appear
in "Chaves estrangeiras". The split MUST be derived from zone membership at
render time — no extra stored data.

#### Scenario: Cross-zone relationship shows in the right strip

- **WHEN** a relationship connects a table in `Principal` to a table in `Geografia`
- **THEN** it appears under "Chaves entre modelos" on both cards

#### Scenario: Internal relationship stays internal

- **WHEN** both tables of a relationship are in the same zone
- **THEN** it appears under "Chaves estrangeiras" and not in the cross-zone strip

### Requirement: Zones persist atomically with the layout

Zone creation, rename, reorder, deletion and table moves MUST be persisted
through the existing layout `PUT` in a single write that also carries positions
and members, emitting only the existing `diagram.layout_saved` audit event.

#### Scenario: Zone change is one write

- **WHEN** a `MEMBER` moves a table between zones
- **THEN** a single layout PUT carries zones, members and positions
- **AND** exactly one `diagram.layout_saved` event is appended

#### Scenario: Failed zone write leaves no partial state

- **WHEN** the zone document PUT fails
- **THEN** the stored zones, members and positions are unchanged
