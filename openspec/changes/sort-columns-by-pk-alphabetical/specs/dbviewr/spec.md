## MODIFIED Requirements

### Requirement: Column rendering order in table view

The viewer MUST render each table's columns with the primary key column(s) first, followed by all other columns sorted alphabetically by name. The sort is case-insensitive and stable.

#### Scenario: Table with a single primary key column
- **WHEN** a table has exactly one column with `primary_key: true`
- **THEN** that column MUST appear first in the rendered column list
- **AND** all other columns MUST follow in alphabetical order by name

#### Scenario: Table with no primary key column
- **WHEN** a table has no column with `primary_key: true`
- **THEN** all columns MUST be rendered in alphabetical order by name

#### Scenario: Table with composite primary key
- **WHEN** a table has multiple columns with `primary_key: true`
- **THEN** all PK columns MUST appear first (preserving their original relative order)
- **AND** all non-PK columns MUST follow in alphabetical order by name

#### Scenario: Column sort is case-insensitive
- **WHEN** column names differ only by case (e.g., `createdAt` vs `created_at`)
- **THEN** the sort MUST treat them as equivalent for ordering purposes
