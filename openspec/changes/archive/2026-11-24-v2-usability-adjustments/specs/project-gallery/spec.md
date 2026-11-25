## ADDED Requirements

### Requirement: Rename a project from the gallery

Every project card MUST expose a rename action to a `MEMBER` or `ADMIN`. The
action MUST open a dialog with the current name, validate it like project
creation and, on success, update the card without leaving the gallery. A `VIEWER`
MUST NOT see the action.

#### Scenario: Renaming updates the card

- **WHEN** a `MEMBER` renames project `Novo Banco` to `Banco Central` from its card
- **THEN** the dialog closes and the card shows `Banco Central`
- **AND** the project list reflects the new name on reload

#### Scenario: Cancel keeps the name

- **WHEN** the user cancels the rename dialog
- **THEN** the project keeps its previous name and no request is sent

#### Scenario: Viewer has no rename action

- **WHEN** a `VIEWER` views the gallery
- **THEN** no rename control is rendered on the cards

### Requirement: Read-only viewer link label

The secondary action on a project card MUST be labelled "Abrir visualização"
(with an accessible name naming the project) so it is not mistaken for the
account's permission status; it MUST keep opening `/viewer/{id}`.

#### Scenario: Gallery card offers the viewer link

- **WHEN** the user looks at a project card
- **THEN** the card shows "Abrir visualização"
- **AND** activating it opens the read-only viewer for that project
