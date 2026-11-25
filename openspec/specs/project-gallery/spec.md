# project-gallery Specification

## Purpose
The authenticated multiprojeto landing: after login the user sees a gallery of their projects as cards, can open one into the workspace, or create a new project from SQL or JSON — the azyboard-style entry point for a multi-project DBMapper. Executable coverage: component tests in `apps/web` (`bun test`).

## Requirements

### Requirement: Gallery is the post-login landing

After a successful login (and on `/` while authenticated) the app MUST show a gallery listing every project as a card with at least its name, description and last-updated timestamp, with an empty state when there are none. The workspace MUST NOT render at `/` anymore.

#### Scenario: Login lands on the gallery
- **WHEN** the user logs in successfully
- **THEN** the gallery is displayed with one card per stored project

#### Scenario: Empty state offers creation
- **WHEN** the account has no projects
- **THEN** the gallery shows an empty-state message and the "Novo projeto" action is available

### Requirement: Open a project from a card

Clicking a card MUST navigate to the workspace for that project (`/project/{id}`), loading its model; refreshing that URL MUST keep the user on the same project while the session is valid.

#### Scenario: Card opens the workspace
- **WHEN** the user clicks a project card
- **THEN** the workspace for that project renders with its tree populated

#### Scenario: Refresh keeps the project
- **WHEN** the user reloads the browser on `/project/{id}`
- **THEN** the same project's workspace is shown (no redirect to the gallery)

### Requirement: Create a project from the gallery

The gallery MUST offer a prominent "Novo projeto" action that creates a project — by importing an `.sql` file or pasted SQL text, or by importing a v1 JSON file — and then opens its workspace.

#### Scenario: New project from SQL file
- **WHEN** the user chooses "Novo projeto", provides a name and selects a `.sql` file
- **THEN** the project is created with the parsed model and the gallery navigates to its workspace

#### Scenario: New project from JSON file
- **WHEN** the user chooses "Novo projeto" and selects a DBMapper JSON file
- **THEN** the project is imported from that file and its workspace opens

#### Scenario: Cancel returns to the gallery
- **WHEN** the user cancels the creation flow
- **THEN** the gallery is shown unchanged, with no project created

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
