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

Every table MUST belong to exactly one zone (`Principal` by default); moving a
table to another zone MUST update the assignment without changing the model,
and newly created or imported tables MUST land in `Principal`.

#### Scenario: Moving a table between zones

- **WHEN** a `MEMBER` moves `cidade` from `Principal` to zone `Geografia`
- **THEN** `cidade` appears only on the `Geografia` tab and disappears from `Principal`

#### Scenario: New tables land in the default zone

- **WHEN** a table is created or a model is imported
- **THEN** it belongs to `Principal`

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
