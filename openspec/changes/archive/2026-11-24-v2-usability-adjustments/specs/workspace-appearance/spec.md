## ADDED Requirements

### Requirement: Rename the open project from the workspace

The workspace header MUST let a `MEMBER` or `ADMIN` rename the open project
either by activating the project name or through the "Ações do projeto" menu.
The dialog starts with the current name, and a successful rename updates the
header and the breadcrumb without reloading the page. A `VIEWER` MUST NOT see
the rename controls.

#### Scenario: Header name opens the rename dialog

- **WHEN** a `MEMBER` activates the project name in the header
- **THEN** the rename dialog opens prefilled with the current name
- **AND** confirming updates the header, breadcrumb and gallery cache

#### Scenario: Viewer cannot rename

- **WHEN** a `VIEWER` opens a project workspace
- **THEN** the rename action is not rendered
