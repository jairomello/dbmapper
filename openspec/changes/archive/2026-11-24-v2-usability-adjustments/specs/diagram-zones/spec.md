## MODIFIED Requirements

### Requirement: Zone tabs

The diagram view MUST show a tab bar with the active zone and a `+` action to
create a zone by name. Zones MUST be renameable, reorderable by drag, and
deletable with confirmation; deleting a zone MUST return to `Principal` only the
tables that do not belong to any other zone, and `Principal` MUST NOT be
deletable.

#### Scenario: Creating a zone

- **WHEN** a `MEMBER` clicks `+` and confirms a zone name
- **THEN** a new tab appears and becomes the active zone

#### Scenario: Deleting a zone returns its tables

- **WHEN** a `MEMBER` deletes a non-default zone containing tables
- **THEN** tables that also belong to other zones remain only in those zones
- **AND** the remaining tables belong to `Principal` again and stay in the model

#### Scenario: Default zone is protected

- **WHEN** the user inspects the delete action for `Principal`
- **THEN** it is not available

### Requirement: Table assignment to zones

Zones are views: a table MUST be allowed to belong to any number of zones at the
same time. Newly created or imported tables MUST land in `Principal`. Adding a
table to a zone MUST NOT remove it from other zones, and MUST NOT change the
model. A table MAY belong to no zone: it then remains in the model and in the
semantic tree but is rendered on no zone tab.

#### Scenario: Moving a table between zones

- **WHEN** a `MEMBER` adds `cidade` to zone `Geografia` while it is also in `Principal`
- **THEN** `cidade` appears on both the `Principal` and the `Geografia` tabs
- **AND** each tab keeps its own position and size for the card

#### Scenario: New tables land in the default zone

- **WHEN** a table is created or a model is imported
- **THEN** it belongs to `Principal`

#### Scenario: A table can stay outside every zone

- **WHEN** a table is removed from all of its zones
- **THEN** it still exists in the model and in the semantic tree
- **AND** it is rendered on no zone tab

### Requirement: Adding tables to the diagram by dragging from the tree

Dragging a table from the semantic tree onto the active zone's canvas MUST add
it to that zone at the drop position. Dropping a table onto a zone tab MUST add
it to that zone, and the tab becomes active; the table MUST keep its memberships
in other zones. Dropping a table that already belongs to the target zone MUST
only move its card when the drop is on the canvas, or do nothing when the drop
is on the tab. Dragging MUST be unavailable to a `VIEWER`.

#### Scenario: Drop adds the table to the active zone

- **WHEN** a `MEMBER` drags `cidade` from the tree and drops it on the `Geografia` canvas
- **THEN** `cidade` belongs to `Geografia` and its card is placed at the drop position
- **AND** any membership it had in other zones is preserved

#### Scenario: Drop on a zone tab adds to that zone

- **WHEN** a `MEMBER` drags `cidade` from the tree and drops it on the `Geografia` tab
- **THEN** `Geografia` becomes the active zone
- **AND** `cidade` is a member of `Geografia` without leaving its other zones

#### Scenario: Dropping an existing table repositions it

- **WHEN** a `MEMBER` drops a table that already belongs to the active zone on the canvas
- **THEN** only its position changes and the memberships stay as they were

#### Scenario: Viewer cannot drag tables in

- **WHEN** a `VIEWER` tries to drag a table from the tree onto the canvas or a tab
- **THEN** no membership or layout change is persisted

### Requirement: Removing a table from the diagram without deleting it

The canvas MUST offer a "Remover desta aba" action per card that removes the
table from the active zone while keeping it in the model, in the semantic tree
and in any other zone. The action MUST NOT be confused with deleting a table,
and the confirmation copy MUST state that the table is kept in the dictionary.

#### Scenario: Removing keeps the table in the model

- **WHEN** a `MEMBER` removes `cidade` from the active zone
- **THEN** `cidade` no longer appears on that zone tab
- **AND** it remains on every other zone that contained it
- **AND** the table, its columns and its relationships are unchanged in the model

#### Scenario: Removing does not change the model

- **WHEN** a table that belonged only to the removed zone is removed
- **THEN** the tree still lists it with a discreet outside marker
- **AND** the model payload is identical to the previous one, except for the layout document

### Requirement: Locate a table from the semantic tree

Selecting a table or column in the semantic tree while the diagram is open MUST
bring that card into view: if the active zone contains the table, the diagram
MUST center its card; otherwise it MUST switch to the first zone containing the
table and then center the card. A table outside every zone MUST offer "Adicionar
à aba atual" to a `MEMBER` instead of silently doing nothing.

#### Scenario: Locating a table from another zone

- **WHEN** a user selects a table that belongs to `Geografia` while `Principal` is active
- **THEN** the diagram switches to `Geografia` and centers the card
- **AND** the card is highlighted

#### Scenario: Locating a table shared by several zones

- **WHEN** a user selects a table that belongs to `Principal` and `Geografia` while `Principal` is active
- **THEN** the diagram stays on `Principal` and centers the card

#### Scenario: Locating a table with no zone

- **WHEN** a user selects a table that belongs to no zone
- **THEN** the canvas does not change zone and offers to add the table to the active zone

### Requirement: Cross-zone keys are derived

Relationships whose other endpoint is outside the active zone MUST be listed in
the card's "Chaves entre modelos" strip; relationships with both endpoints
inside the active zone MUST appear in "Chaves estrangeiras". The split MUST be
derived from zone membership at render time — no extra stored data.

#### Scenario: Cross-zone relationship shows in the right strip

- **WHEN** a relationship connects a table in `Principal` to a table that is not in `Principal`
- **THEN** it appears under "Chaves entre modelos" on both cards

#### Scenario: Internal relationship stays internal

- **WHEN** both tables of a relationship belong to the active zone
- **THEN** it appears under "Chaves estrangeiras" and not in the cross-zone strip

## ADDED Requirements

### Requirement: Zones are managed from the item panel

The semantic tree MUST NOT render a per-table zone selector. For a `MEMBER`,
the item panel shown in diagram mode MUST list every zone with a checkbox for
the selected table, allowing memberships to be added and removed without
changing the model. A `VIEWER` MUST see the memberships without edit controls.

#### Scenario: Toggling zones from the panel

- **WHEN** a `MEMBER` selects a table and checks zone `Financeiro` in the item panel
- **THEN** the table joins `Financeiro` while keeping its other memberships
- **AND** unchecking `Principal` removes it only from `Principal`

#### Scenario: Viewer sees memberships read-only

- **WHEN** a `VIEWER` opens the item panel for a table
- **THEN** the zones are listed but the checkboxes cannot change memberships
