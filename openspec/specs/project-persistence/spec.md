# project-persistence Specification

## Purpose
Owns the in-memory project model and the JSON file format that DBMapper exports and that DBViewer consumes. The shape is a single `database` object containing identity, business metadata, and a list of tables; each table carries columns, relationships, and review metadata. Importing a project backfills fields that older exports may omit, captures the picked file's base name for the next save, and normalizes relationships so the rest of the app can rely on a consistent in-memory shape. The save action opens a modal that suggests a timestamped filename and lets the user confirm or edit it before download. The pure helpers behind the suggestion (`buildTimestamp`, `stripTimestampPrefix`, `slugifyBaseName`, `resolveBaseName`, `suggestSaveFilename`, `sanitizeUserFilename`) are exercised by `tests/project-persistence.test.js`, which is the executable contract for the suggestion logic; the cross-cutting JSON contract itself is verified indirectly by the other capability tests.
## Requirements
### Requirement: Project data model

The system MUST maintain a single in-memory `projectData` object whose root is `database` and that contains the database's identity, business metadata, and a list of tables, each with its own columns, relationships, and review metadata.

#### Scenario: Default project shape on first load
- **WHEN** the page is loaded for the first time and no JSON has been imported
- **THEN** `projectData.database` MUST equal `{ name: "Novo Banco", description: "", business_terms: [], reviewed: false, tables: [] }`

#### Scenario: Column record shape
- **WHEN** a table holds columns parsed from SQL or loaded from JSON
- **THEN** each column MUST expose `name`, `type`, `primary_key`, `foreign_key`, `description`, `business_terms`, `reviewed`, and `status`

#### Scenario: Table record shape
- **WHEN** a table is held in the project
- **THEN** it MUST expose `name`, `description`, `business_terms`, `reviewed`, `status`, `columns`, and `relationships` (with `parents` and `children`)

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

### Requirement: Project import from JSON

The system MUST provide an "Abrir Projeto" action that lets the user pick a `.json` file and load it into `projectData`, while backfilling fields that older exports do not include.

#### Scenario: Successful import of a current-format file
- **WHEN** the user picks a JSON file whose root has a `database` key
- **THEN** the system MUST replace `projectData` with the parsed object
- **AND** `hasLoadedProject` MUST become `true`
- **AND** the welcome screen MUST be hidden
- **AND** the "Atualizar Modelo" button MUST be shown

#### Scenario: Missing fields are backfilled
- **WHEN** the imported JSON omits `database.reviewed`, `database.description`, or `database.business_terms`
- **THEN** those fields MUST default to `false`, `""`, and `[]` respectively
- **AND** every imported table MUST have `relationships = { parents: [], children: [] }`
- **AND** every imported column MUST have `reviewed`, `primary_key`, and `foreign_key` defaulted to `false` if missing

#### Scenario: Imported relationships are normalized
- **WHEN** the imported JSON contains tables with `relationships.parents` or `relationships.children`
- **THEN** the system MUST run `normalizeRelationships` on the imported tables so parent/child lists are deduped and the column-level PK/FK flags match the relationships

#### Scenario: Malformed JSON
- **WHEN** the user picks a file that is not valid JSON or that has no `database` key
- **THEN** the system MUST surface a `M.toast` with the message `Erro ao carregar JSON.`
- **AND** `projectData` MUST remain unchanged

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

### Requirement: Cross-consumer JSON contract

The same JSON shape produced by DBMapper's export MUST be consumable by DBViewer and by any future consumer, without any field renaming or version negotiation.

#### Scenario: DBViewer reads a DBMapper export
- **WHEN** a JSON file produced by `exportProjectJSON` is opened in `dbviewer.html`
- **THEN** the viewer MUST render the database name, every non-`REMOVED` table, and its columns
- **AND** the viewer MUST display the parent/child relationships using the `parents` and `children` arrays from the JSON

### Requirement: Relationship metadata fields

Each parent relationship in the in-memory model and in the exported JSON MUST be allowed to carry a `description: string` and a `reviewed: boolean`. Both fields are optional on disk and MUST default to `""` and `false` respectively when the project is normalized on import.

#### Scenario: Defaults on import
- **WHEN** a JSON project is loaded and a parent relationship is missing `description` or `reviewed`
- **THEN** the importer MUST backfill `description: ""` and `reviewed: false` for that relationship
- **AND** the backfill MUST be applied by the same `normalizeRelationships` call that the importer already runs

#### Scenario: Defaults on SQL import
- **WHEN** a SQL file is imported and a parent relationship is created by the parser
- **THEN** the relationship MUST be created with `description: ""` and `reviewed: false`

#### Scenario: Preserved across wizard apply
- **WHEN** the model update wizard applies a state where a parent relationship is kept or moved
- **THEN** the resulting relationship MUST preserve the previous `description` and `reviewed` values where the relationship identity is unchanged

#### Scenario: Exported shape
- **WHEN** the project is exported to JSON
- **THEN** each parent relationship MUST include the `description` and `reviewed` fields
- **AND** the on-disk field names MUST be exactly `description` and `reviewed`

### Requirement: Capability Purpose paragraph

The `## Purpose` section of this spec MUST describe the capability in 1–3 behavior-oriented sentences, must NOT contain the placeholder `TBD - created by archiving`, and MUST name the executable test script (if any) and the cross-cutting `project-persistence` contract (if relevant).

#### Scenario: Purpose paragraph is non-placeholder

- **WHEN** a reader opens this spec file
- **THEN** the `## Purpose` section MUST NOT contain the string `TBD - created by archiving`
- **AND** the section MUST contain at least one complete sentence describing the capability's user-facing responsibility

### Requirement: OpenSpec context and rules configured
The project SHALL declare a `context:` block in `openspec/config.yaml` describing the tech stack, conventions, and product domain, and a `rules:` block with per-artifact constraints (proposal, design, specs, tasks). The static-site setup (no bundler, no framework, no `package.json` test script) is the project's defining constraint and MUST be reflected in the context.

#### Scenario: Context block exists and is non-empty
- **WHEN** a future change is created and the CLI injects the project context into artifact instructions
- **THEN** `openspec/config.yaml` MUST contain a `context:` block with at least one non-empty line
- **AND** the block MUST mention the static-site constraint and the ad-hoc Node test style

#### Scenario: Rules block exists with the four artifact types
- **WHEN** the CLI loads `openspec/config.yaml`
- **THEN** the `rules:` block MUST contain at least one rule for each of `proposal`, `specs`, and `tasks`
- **AND** the rules MUST include the no-bundler / no-framework guardrail

#### Scenario: Schema remains spec-driven
- **WHEN** `openspec/config.yaml` is read
- **THEN** the top-level `schema:` value MUST remain `spec-driven`

### Requirement: Page is served under the static-site-security controls

The page that hosts this capability (`dbmapper.html`) MUST be served with the SRI, CSP, and "no inline scripts/handlers" controls defined in the `static-site-security` specification.

#### Scenario: Page is served under static-site-security

- **WHEN** `dbmapper.html` is loaded
- **THEN** the page MUST satisfy every `Requirement` of the `static-site-security` capability (SRI on every CDN resource including the Materialize CSS and JS at version `1.0.0` on cdnjs, a `<meta http-equiv="Content-Security-Policy">` in the head, no inline `<script>` or `<style>` block, no `on*=` handlers, and external CSS/JS in standalone files)

### Requirement: Viewer consumer reference uses the corrected name

The cross-consumer JSON contract MUST name the viewer consumer as `DBViewer` and reference its file as `dbviewer.html`. The misspelled `DBViewr` / `dbviewr.html` references MUST NOT appear in this spec or in any other shipped artifact that points at the viewer.

#### Scenario: Viewer consumer reference is spelled correctly

- **WHEN** a reader inspects `project-persistence/spec.md` or any cross-reference to the viewer consumer in shipped artifacts
- **THEN** the artifact MUST NOT contain the substrings `DBViewr` or `dbviewr.html` when referring to the viewer

