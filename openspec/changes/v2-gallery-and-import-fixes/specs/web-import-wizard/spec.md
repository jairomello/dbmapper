# Spec Delta

## MODIFIED Requirements

### Requirement: Create a project from SQL

The workspace MUST accept an SQL file (or pasted text), parse it through the API, and create the populated project — showing the resulting tables/columns in the tree — with a clear error when the script contains no `CREATE TABLE`. File import MUST be a prominent, clearly labeled action (not a bare native input) in every entry point that creates or updates a project, and MUST accept large `.sql` dumps by reading them client-side.

#### Scenario: Import creates the model
- **WHEN** the user submits a valid `.sql` file for a new project
- **THEN** the project is created and the tree renders its tables, columns and FKs

#### Scenario: Invalid script errors clearly
- **WHEN** the submitted script has no `CREATE TABLE`
- **THEN** the UI shows the server's error message and no project is created

#### Scenario: File import is discoverable
- **WHEN** a user looks for how to load an existing `.sql` dump in the new-project flow or in the update wizard
- **THEN** a clearly labeled "Importar arquivo .sql" action (button or drop area) is visible alongside the text area

#### Scenario: Large SQL dump
- **WHEN** the user selects a multi-megabyte `.sql` export from their database
- **THEN** the file is read client-side, submitted as text, and the flow completes without truncation

### Requirement: JSON export and import

The workspace MUST export the current project as the v1 contract JSON (download) and import a v1 JSON as a project — the same round-trip the v1 app offered, including files produced by DBMapper 1.0: unknown fields are ignored, missing fields are backfilled, and only a payload without a `database` object is rejected.

#### Scenario: Export round-trips
- **WHEN** the user exports a project and re-imports the file
- **THEN** the imported project carries the same tables, columns, descriptions, terms and review states

#### Scenario: Legacy DBMapper 1.0 export imports
- **WHEN** a JSON file exported by the v1 static app (its own field set, including any fields the v2 schema does not model and without fields v2 added) is imported
- **THEN** the project is created with every table, column, relationship, description, term and review state preserved and v2-only fields backfilled to defaults
