# web-import-wizard Specification

## Purpose
Create a dictionary project from a SQL script and evolve an existing one through the update wizard — preview the diff, choose explicit renames, confirm and apply — plus round-trip the v1 JSON contract via export/import. This is the v1 `sql-import`/`model-update-wizard`/`project-persistence` user journey on the new stack. Executable coverage: component tests in `apps/web` plus the Playwright smoke.

## Requirements

### Requirement: Create a project from SQL

The workspace MUST accept an SQL file (or pasted text), parse it through the API, and create the populated project — showing the resulting tables/columns in the tree — with a clear error when the script contains no `CREATE TABLE`.

#### Scenario: Import creates the model
- **WHEN** the user submits a valid `.sql` file for a new project
- **THEN** the project is created and the tree renders its tables, columns and FKs

#### Scenario: Invalid script errors clearly
- **WHEN** the submitted script has no `CREATE TABLE`
- **THEN** the UI shows the server's error message and no project is created

### Requirement: Update wizard

The wizard MUST guide the user through: upload the new SQL → table plan (keep / delete / rename / add, with explicit rename selectors) → column plan (including type-change flags) → relationship changes (informational) → summary with counters — applying only on final confirmation, via the API preview/apply flow.

#### Scenario: Preview drives the steps
- **WHEN** the user uploads an updated script for an existing project
- **THEN** each step shows the diff rows (added/removed/renamed/type-changed/FK changes) computed by the API preview, and the stored model is unchanged until confirmation

#### Scenario: Renames are explicit
- **WHEN** the user wants to treat a disappeared table as renamed
- **THEN** they must select the target table in the rename control; nothing is inferred automatically

#### Scenario: Apply preserves documentation
- **WHEN** the user confirms a plan where kept/renamed items had descriptions and approvals
- **THEN** after apply the tree shows those items with metadata intact, new items as `sem desc`, and changed types flagged

### Requirement: JSON export and import

The workspace MUST export the current project as the v1 contract JSON (download) and import a v1 JSON as a project — the same round-trip the v1 app offered.

#### Scenario: Export round-trips
- **WHEN** the user exports a project and re-imports the file
- **THEN** the imported project carries the same tables, columns, descriptions, terms and review states
