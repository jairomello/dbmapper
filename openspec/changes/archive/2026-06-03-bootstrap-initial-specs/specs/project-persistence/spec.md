## ADDED Requirements

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

The system MUST provide a "Salvar" action that downloads the current `projectData` as a UTF-8 JSON file whose name is derived from the database name.

#### Scenario: Save creates a download
- **WHEN** the user clicks "Salvar" with the database named `Meu Banco`
- **THEN** the browser MUST download a file named `dbmapper-meu-banco.json`
- **AND** the file content MUST be `JSON.stringify(projectData, null, 2)`

#### Scenario: Whitespace in database name is normalized
- **WHEN** the database name contains spaces
- **THEN** the downloaded filename MUST have those spaces replaced with hyphens and MUST be lowercased

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

### Requirement: Cross-consumer JSON contract

The same JSON shape produced by DBMapper's export MUST be consumable by DBViewr and by any future consumer, without any field renaming or version negotiation.

#### Scenario: DBViewr reads a DBMapper export
- **WHEN** a JSON file produced by `exportProjectJSON` is opened in `dbviewr.html`
- **THEN** the viewer MUST render the database name, every non-`REMOVED` table, and its columns
- **AND** the viewer MUST display the parent/child relationships using the `parents` and `children` arrays from the JSON
