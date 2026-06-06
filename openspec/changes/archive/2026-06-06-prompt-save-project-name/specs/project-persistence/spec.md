## MODIFIED Requirements

### Requirement: Project export to JSON

The system MUST provide a "Salvar" action that opens a confirmation modal pre-filled with a suggested filename, and downloads the current `projectData` as a UTF-8 JSON file when the user confirms. The download itself MUST produce a file whose stem is the user-confirmed value, the JSON content MUST be `JSON.stringify(projectData, null, 2)`, and the modal MUST be dismissible without triggering a download.

#### Scenario: Save opens a modal instead of downloading immediately
- **WHEN** the user clicks "Salvar"
- **THEN** the system MUST open a modal with a text input pre-filled with a suggested filename ending in `.json`
- **AND** the system MUST NOT trigger a file download until the user confirms

#### Scenario: User confirms with the suggested filename
- **WHEN** the user clicks the modal's "Salvar" button with the suggested value unchanged
- **THEN** the browser MUST download a file whose name equals the suggested value
- **AND** the file content MUST be `JSON.stringify(projectData, null, 2)`

#### Scenario: User edits the filename before saving
- **WHEN** the user types a different value in the modal input and clicks "Salvar"
- **THEN** the browser MUST download a file whose name equals the edited value (trimmed, with `.json` appended if missing)

#### Scenario: User cancels the modal
- **WHEN** the user clicks "Cancelar" or dismisses the modal
- **THEN** the system MUST NOT trigger a file download
- **AND** the modal MUST close

#### Scenario: Whitespace in the user-edited filename
- **WHEN** the user-confirmed value contains leading or trailing whitespace
- **THEN** the downloaded filename MUST be the value with surrounding whitespace removed

## ADDED Requirements

### Requirement: Save filename suggestion

The system MUST compute a default filename suggestion of the form `AAAA-MM-DD-HH-MM-<base>.json`, where `AAAA-MM-DD-HH-MM` is the local-time timestamp of the moment the modal opens, and `<base>` is resolved by the chain in the scenarios below. The suggestion MUST appear in the modal input every time the modal opens and MUST be recomputed on each open (not memoized across opens).

#### Scenario: Base name comes from a previously saved or loaded project
- **WHEN** the user clicks "Salvar" and an in-memory base name has been recorded for the current project
- **THEN** the suggestion MUST end with `-<recorded-base>.json`

#### Scenario: Base name falls back to the database name when it has been edited
- **WHEN** the user clicks "Salvar" with no recorded base name
- **AND** `projectData.database.name` is non-empty and not the literal default `"Novo Banco"`
- **THEN** the suggestion MUST end with `-<database-name>.json` (lowercased and with spaces replaced by hyphens)

#### Scenario: Base name falls back to the SQL database name
- **WHEN** the user clicks "Salvar" with no recorded base name and an unchanged default database name
- **AND** a SQL database name was captured at the most recent SQL import
- **THEN** the suggestion MUST end with `-<sql-database-name>.json` (lowercased and with spaces replaced by hyphens)

#### Scenario: Base name falls back to "mapper"
- **WHEN** the user clicks "Salvar" with no recorded base name, an unchanged default database name, and no captured SQL database name
- **THEN** the suggestion MUST end with `-mapper.json`

#### Scenario: Timestamp uses local time
- **WHEN** the user clicks "Salvar" at local time 2026-06-05 21:07
- **THEN** the suggestion MUST start with `2026-06-05-21-07-`

#### Scenario: Carryover across multiple saves of the same project
- **WHEN** the user has saved the project once and clicks "Salvar" again without reloading
- **THEN** the new suggestion MUST keep the same `<base>` as the previous save
- **AND** MUST differ from the previous suggestion only in the timestamp prefix

### Requirement: Import records the picked file's base name

When a JSON project is loaded, the system MUST capture the picked file's base name (without the `.json` extension) and strip any leading `AAAA-MM-DD-HH-MM-` timestamp prefix, so that the next "Salvar" can reuse that base name. The captured base name MUST be cleared at the start of a fresh SQL import.

#### Scenario: Importing a timestamped file reuses its base name
- **WHEN** the user picks a file named `2026-06-05-21-07-loja-varejista.json`
- **THEN** the system MUST record `loja-varejista` as the current project base name
- **AND** a subsequent "Salvar" MUST suggest a filename ending with `-loja-varejista.json`

#### Scenario: Importing a non-timestamped file uses the full stem
- **WHEN** the user picks a file named `loja.json`
- **THEN** the system MUST record `loja` as the current project base name

#### Scenario: SQL import clears the recorded base name
- **WHEN** the user imports a SQL file after having loaded a JSON project
- **THEN** the recorded base name MUST be cleared
- **AND** the SQL database name (if any) MUST take its place for the base-name resolution chain
