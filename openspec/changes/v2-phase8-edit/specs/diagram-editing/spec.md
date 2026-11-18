# Spec Delta

## Purpose

Let users structure their data model directly on the ER canvas — create and
delete tables, columns and relationships (with automatic foreign-key column
creation), edit column basics, undo mistakes, and keep every change flowing
through the existing audited model save with clear save status.

## ADDED Requirements

### Requirement: Create and delete tables from the canvas

The canvas MUST let a `MEMBER` create a table from the context menu (placed at
the cursor position) or the toolbar, and delete a table with confirmation; the
model and the semantic tree MUST reflect the change after the save completes.

#### Scenario: Context menu creates a table at the cursor

- **WHEN** a `MEMBER` right-clicks empty canvas space and chooses "Adicionar tabela"
- **THEN** a new table is created in the model at that position
- **AND** the tree shows the new table

#### Scenario: Deleting a table requires confirmation

- **WHEN** a `MEMBER` chooses to delete a table from the context menu and confirms
- **THEN** the table and its columns and relationships are removed from the model
- **AND** undo restores the table with its columns and relationships

### Requirement: Create and delete columns from a card

The canvas MUST let a `MEMBER` add a column to a table from its card and
delete a column with confirmation. A duplicate column name within the same
table MUST be rejected with an inline validation message and no save issued.

#### Scenario: Adding a column

- **WHEN** a `MEMBER` adds a column named `email` to a table lacking it
- **THEN** the card shows the new column after the save completes

#### Scenario: Duplicate name is rejected

- **WHEN** a `MEMBER` tries to create a column with a name the table already has
- **THEN** an inline validation error is shown and the model is unchanged

### Requirement: Relationship creation with automatic FK column

Creating a relationship by dragging between cards or via the `1:n` mode MUST
offer a pre-checked option to create the foreign-key column named after the
target table (`<target>_id`, editable). Confirming MUST send the new column and
the new relationship in a single model save; when the column already exists it
MUST be reused instead.

#### Scenario: Connecting two tables creates the FK column

- **WHEN** a `MEMBER` connects `cidade` to `estado` with the auto-create option on
- **THEN** a single save adds column `estado_id` to `cidade` and the relationship
- **AND** the card shows the column with the FK mark and the edge appears

#### Scenario: Existing column is reused

- **WHEN** the target column already exists on the source table
- **THEN** no duplicate column is created and the relationship uses it

#### Scenario: Collision is reported

- **WHEN** the proposed FK column name already exists with an incompatible role
- **THEN** the dialog reports the conflict and no save is issued until resolved

### Requirement: Edit column and table basics from the canvas

The canvas MUST expose a popover to edit a column's name, type, size and
primary-key flag and a table's name, persisted through the model save.
Validation errors (empty or duplicate name) MUST be shown inline without
saving.

#### Scenario: Renaming a column

- **WHEN** a `MEMBER` changes a column name in the popover and confirms
- **THEN** the save persists the new name and the card re-renders with it

#### Scenario: Empty name is rejected

- **WHEN** the name field is emptied and confirmed
- **THEN** an inline validation error appears and nothing is saved

### Requirement: Undo and redo canvas mutations

Canvas mutations MUST be recorded with their inverse so `Undo` reverts the
last mutation and `Redo` reapplies it; performing a new mutation MUST clear the
redo history. Undo/redo results MUST be persisted like any other edit.

#### Scenario: Undo reverts a deletion

- **WHEN** a `MEMBER` deletes a column and presses undo
- **THEN** the column returns with its previous definition and the save persists it

#### Scenario: New mutation clears redo

- **WHEN** a user undoes an action and then performs a different mutation
- **THEN** the redo history is empty

### Requirement: Serialized saves with visible status

Canvas mutations MUST be saved one at a time (never in parallel), with the
status indicator showing `Salvando...` during a write and `Salvo às: HH:MM`
after success. A failed save MUST surface the error and re-sync the canvas
with the server state.

#### Scenario: Saves are serialized

- **WHEN** several mutations are triggered in quick succession
- **THEN** their saves are sent sequentially, never concurrently

#### Scenario: Failure resyncs

- **WHEN** a model save is rejected by the server
- **THEN** the error is shown and the canvas reflects the server's model, not the rejected local state

### Requirement: Viewer cannot edit from the canvas

A `VIEWER` MUST see no editing controls (context menu actions, add/delete
buttons, popovers) on the canvas; no model save MAY be attempted.

#### Scenario: Viewer sees a read-only canvas

- **WHEN** a `VIEWER` opens the diagram view
- **THEN** all edit affordances are hidden and no save request can be triggered
