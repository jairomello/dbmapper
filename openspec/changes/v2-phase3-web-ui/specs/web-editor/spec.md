# Spec Delta

## Purpose

The authenticated editing surface: login into the session, pick or create a project, navigate the semantic tree, edit descriptions/terms with the review workflow, and read live coverage metrics — the v1 editor's durable behavior on the React stack. Executable coverage: component tests in `apps/web` (`bun test`) plus the Playwright smoke.

## ADDED Requirements

### Requirement: Login and session UI

The app MUST show a login form when unauthenticated, establish the session via `POST /api/auth/login`, redirect to the workspace on success, and surface login errors without revealing whether the email exists. A logout control MUST end the session and return to the login form.

#### Scenario: Unauthenticated lands on login
- **WHEN** the app loads without a valid session
- **THEN** the login form is the only visible surface and API calls are not made with a broken session

#### Scenario: Failed login is generic
- **WHEN** the user submits a wrong password
- **THEN** the same generic error message is shown as for an unknown email

### Requirement: Semantic tree

The workspace MUST render `database → tables → columns` with a status badge per item — `sem desc` (empty description), `revisar` (described, not approved), `aprovado` (described and approved) — collapse/expand per table, expand/collapse all, and highlight the active item which drives the editor.

#### Scenario: Badges reflect state
- **WHEN** a table has no description and a column is described but not approved
- **THEN** the table shows `sem desc` and the column shows `revisar`

#### Scenario: Selection drives the editor
- **WHEN** the user clicks a column
- **THEN** the editor loads that column's data and the item is highlighted in the tree

### Requirement: Metadata editor with review workflow

The editor MUST let the user edit the description (save persists to the API), manage business terms as chips (add with Enter, remove), and toggle approval via "Aprovar Descrição"/"Reabrir Revisão". Approval MUST be disabled while the description is empty; editing an approved item MUST reopen its review on save; the review status MUST record the acting user.

#### Scenario: Approval gate
- **WHEN** the description is empty or whitespace
- **THEN** the approve button is disabled and attempting approval shows "Preencha a descrição antes de aprovar."

#### Scenario: Approved edit reopens review
- **WHEN** the user changes the description of an approved item and saves
- **THEN** the item returns to `revisar` and the tree badge updates

#### Scenario: Approval persists with attribution
- **WHEN** the user approves an item
- **THEN** the API records `reviewed: true` with `reviewed_by` set to the logged-in user and the badge shows `aprovado`

### Requirement: Coverage status bar

The workspace MUST show a status bar with: total tables, columns and FKs; described and reviewed counts/percentages for tables and columns; pending count; and overall progress — recomputed whenever the model changes.

#### Scenario: Metrics match the model
- **WHEN** a project has 3 tables, 10 columns of which 4 are described and 2 of those approved
- **THEN** the bar shows the matching totals and percentages, and pending counts the undescribed items
