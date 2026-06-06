# model-update-wizard Specification

## Purpose
Diffs the current project against a newly imported SQL and walks the user through a 5-step wizard (`upload` → `tables` → `columns` → `relationships` → `summary`) where they choose per-row actions: keep, delete, rename, or add. On apply, the wizard merges the new state into `project-persistence`, preserving descriptions, business terms, and review status for kept and renamed items, and resetting metadata to empty for added items. The executable contract is `tests/update-model.test.js`, which also exercises the parser end-to-end.
## Requirements
### Requirement: Wizard entry point

The "Atualizar Modelo" button MUST open a multi-step wizard that lets the user evolve the current project by importing a new SQL file. The button MUST only be available when a project is already loaded.

#### Scenario: Button hidden without a loaded project
- **WHEN** `hasLoadedProject` is `false`
- **THEN** the "Atualizar Modelo" button MUST be hidden

#### Scenario: Button shown after project load
- **WHEN** the user opens a JSON project
- **THEN** the "Atualizar Modelo" button MUST become visible

#### Scenario: Clicking the button opens the modal
- **WHEN** the user clicks "Atualizar Modelo" while a project is loaded
- **THEN** the wizard modal MUST open on the `upload` step
- **AND** the in-memory wizard state MUST be reset to `{ step: "upload", oldTables: [], newTables: [], tableRows: [], columnGroups: [], relationshipGroups: [] }`

#### Scenario: Clicking the button without a project
- **WHEN** the user clicks "Atualizar Modelo" while `hasLoadedProject` is `false`
- **THEN** the system MUST surface a `M.toast` with the message `Abra um projeto JSON antes de atualizar o modelo.`

### Requirement: Upload step

The first step of the wizard MUST let the user pick a `.sql` file representing the new schema version; after parsing, the wizard MUST advance to the `tables` step.

#### Scenario: Successful upload
- **WHEN** the user picks a `.sql` file in the upload step
- **THEN** the system MUST parse it into a `newTables` list
- **AND** MUST build the wizard state via `createUpdateWizardState(projectData.database, newTables)`
- **AND** the wizard MUST advance to the `tables` step

#### Scenario: Invalid SQL
- **WHEN** the picked file parses to zero tables
- **THEN** the system MUST surface a `M.toast` with the message `Erro ao processar SQL da nova versão.`
- **AND** the wizard MUST stay on the `upload` step

### Requirement: Tables comparison step

The `tables` step MUST show every table from the current project and every table from the new SQL, with an action control that lets the user choose between "Sem alteração", "Excluir do banco atual", or "Tabela mudou de nome" for missing tables, and must mark added tables as "Adicionar no banco atual".

#### Scenario: Same-name tables appear as `Sem alteração`
- **WHEN** a table exists in both the current project and the new SQL with the same name
- **THEN** it MUST appear in the comparison grid as a row of kind `same`
- **AND** the action cell MUST read `Sem alteração`

#### Scenario: Removed tables can be renamed
- **WHEN** a table exists in the current project but not in the new SQL
- **THEN** the row MUST default to action `Excluir do banco atual`
- **AND** the action control MUST offer the alternative `Tabela mudou de nome` with a select to choose a target name from the new tables

#### Scenario: New tables are marked for addition
- **WHEN** a table exists in the new SQL but not in the current project
- **THEN** the row MUST show the action `Adicionar no banco atual`
- **AND** if the new table name is already used as a rename target, the action MUST read `Mapeada como novo nome de <oldName>` and the row MUST be visually marked

#### Scenario: Next button builds column groups
- **WHEN** the user clicks "Avançar" on the `tables` step
- **THEN** the system MUST build `columnGroups` from the current table plans
- **AND** the wizard MUST advance to the `columns` step

### Requirement: Columns comparison step

The `columns` step MUST group rows by resulting table and let the user decide what to do with columns that were added, removed, or had their type changed, while keeping same-type columns as `Sem alteração`.

#### Scenario: Same-type column
- **WHEN** a column exists in both versions with the same name and the same normalized type
- **THEN** the row MUST appear with action `Sem alteração`

#### Scenario: Changed-type column
- **WHEN** a column exists in both versions with the same name but a different type
- **THEN** the row MUST appear with action `Atualizar tipo`
- **AND** the resulting column MUST carry `status: "CHANGED"` after apply

#### Scenario: Removed column
- **WHEN** a column exists in the current project but not in the new SQL
- **THEN** the row MUST default to action `Excluir do banco atual`
- **AND** the action control MUST offer the alternative `Campo mudou de nome` with a select for the new column name

#### Scenario: New column
- **WHEN** a column exists in the new SQL but not in the current project
- **THEN** the row MUST show the action `Adicionar no banco atual`
- **AND** if the new column name is already used as a rename target, the action MUST read `Mapeado como novo nome de <oldName>`

#### Scenario: Next button builds relationship groups
- **WHEN** the user clicks "Comparar relacionamentos" on the `columns` step
- **THEN** the system MUST build `relationshipGroups` from the current state
- **AND** the wizard MUST advance to the `relationships` step

### Requirement: Relationships comparison step

The `relationships` step MUST show the foreign keys that were added or removed between the current project and the new SQL, grouped by table, and offer no per-row action beyond review.

#### Scenario: Empty diff
- **WHEN** the two versions have identical sets of parent relationships
- **THEN** the step MUST show a panel reading `Nenhuma alteração de relacionamento` with a `link_off` icon

#### Scenario: Added FK
- **WHEN** a parent relationship exists in the new SQL but not in the current project
- **THEN** the row MUST show the action `Adicionar FK`

#### Scenario: Removed FK
- **WHEN** a parent relationship exists in the current project but not in the new SQL
- **THEN** the row MUST show the action `Remover FK`

#### Scenario: Next button advances to summary
- **WHEN** the user clicks "Revisar resumo" on the `relationships` step
- **THEN** the wizard MUST advance to the `summary` step

### Requirement: Summary and apply

The `summary` step MUST aggregate the planned changes and, on confirmation, apply them to the current project, preserving existing metadata for kept or renamed items.

#### Scenario: Summary counts
- **WHEN** the summary step is rendered
- **THEN** it MUST display counts for: tables added, tables deleted, tables renamed, columns added, columns deleted, columns renamed, columns with updated types, FKs added, FKs removed

#### Scenario: Preservation note
- **WHEN** the summary is rendered
- **THEN** it MUST include the note `Descrições, termos de negócio e marcações de revisão já existentes serão preservados nas tabelas e campos mantidos ou renomeados.`

#### Scenario: Apply mutates the project
- **WHEN** the user clicks "Aplicar alterações"
- **THEN** `applyUpdateWizardState(projectData.database, updateWizardState)` MUST run
- **AND** `currentSelectedItem` MUST be cleared
- **AND** the tree MUST re-render
- **AND** the wizard modal MUST close
- **AND** a `M.toast` MUST show `Modelo atualizado com sucesso!`

#### Scenario: Renamed table keeps its metadata
- **WHEN** a table is renamed and applied
- **THEN** the resulting table MUST keep the previous `description`, `business_terms`, and `reviewed` flag
- **AND** its columns MUST keep the previous descriptions, terms, and reviewed flags where the column name was kept or renamed

#### Scenario: Added table is empty of metadata
- **WHEN** a table is added
- **THEN** the resulting table MUST have empty `description`, empty `business_terms`, `reviewed: false`, and `status: "NEW"`
- **AND** every added column MUST have `description: ""`, `business_terms: []`, `reviewed: false`, and `status: "NEW"`

#### Scenario: Deleted table is dropped on apply
- **WHEN** a table is marked for deletion
- **THEN** it MUST NOT appear in the resulting `database.tables`

### Requirement: Navigation controls

The wizard MUST provide a "Voltar" button and a primary "Avançar" / action button, and MUST disable "Voltar" on the first two steps.

#### Scenario: Back is disabled on upload
- **WHEN** the wizard is on the `upload` step
- **THEN** the "Voltar" button MUST be disabled

#### Scenario: Back is disabled on tables
- **WHEN** the wizard is on the `tables` step
- **THEN** the "Voltar" button MUST be disabled

#### Scenario: Back steps backwards
- **WHEN** the wizard is on `relationships`
- **THEN** clicking "Voltar" MUST move to `columns`
- **WHEN** the wizard is on `columns`
- **THEN** clicking "Voltar" MUST move to `tables`
- **WHEN** the wizard is on `summary`
- **THEN** clicking "Voltar" MUST move to `relationships`

### Requirement: Cancel and close

The wizard MUST let the user close the modal at any time without applying changes.

#### Scenario: Cancel discards wizard state
- **WHEN** the user clicks "Cancelar" or the close icon
- **THEN** `updateWizardState` MUST be reset to `null`
- **AND** the modal MUST close
- **AND** `projectData.database` MUST remain unchanged

### Requirement: Capability Purpose paragraph
The `## Purpose` section of this spec MUST describe the capability in 1–3 behavior-oriented sentences, must NOT contain the placeholder `TBD - created by archiving`, and MUST name the executable test script (if any) and the cross-cutting `project-persistence` contract (if relevant).

#### Scenario: Purpose paragraph is non-placeholder
- **WHEN** a reader opens this spec file
- **THEN** the `## Purpose` section MUST NOT contain the string `TBD - created by archiving`
- **AND** the section MUST contain at least one complete sentence describing the capability's user-facing responsibility

