# workspace-appearance Specification

## Purpose
Provide a cohesive, accessible appearance for the authenticated v2 workspace and its diagram in light and dark themes.

## Requirements

### Requirement: Workspace theme selection
The workspace MUST offer light and dark themes and persist the explicit selection locally in the browser. Without a saved preference it MUST follow the system preference, falling back to light.

#### Scenario: Theme survives reload
- **WHEN** the user selects dark theme and reloads the workspace
- **THEN** the workspace and diagram render in dark theme

#### Scenario: Storage unavailable
- **WHEN** local storage is unavailable
- **THEN** theme switching works for the current session without blocking the workspace

### Requirement: Cohesive accessible workspace
Both themes MUST apply consistently to navigation, tree, canvas, cards, editor, status, menus and dialogs. Text and interactive controls MUST have visible keyboard focus and sufficient contrast, with text contrast of at least 4.5:1 and non-text controls at least 3:1.

#### Scenario: Keyboard access in either theme
- **WHEN** the user navigates the workspace using a keyboard in either theme
- **THEN** the focused control is visible and operable
- **AND** status and selection are identifiable without color alone

### Requirement: Workspace commands remain available
The redesigned workspace MUST retain existing project, diagram, metadata, zone and coverage actions with their role restrictions and clear accessible names.

#### Scenario: Project actions in a menu
- **WHEN** a user opens the project actions menu
- **THEN** available import, export, SQL, model update and suggestion actions remain reachable
- **AND** actions respect the user's role

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
