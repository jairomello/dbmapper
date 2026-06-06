## ADDED Requirements

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
