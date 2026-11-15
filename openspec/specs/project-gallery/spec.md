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
