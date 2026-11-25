## ADDED Requirements

### Requirement: Alphabetical table order

The semantic tree MUST list tables in alphabetical order by name, regardless of
the order in which the model provides them, using a locale-aware, case-insensitive
and numeric-aware comparison. The database root and the column order MUST remain
unchanged.

#### Scenario: Tables are alphabetical

- **WHEN** the model provides tables `zeta`, `cliente`, `alfa`
- **THEN** the tree lists `alfa`, `cliente`, `zeta`

### Requirement: Review filter

The tree MUST offer a filter with **Todas**, **Aprovadas** and **Pendentes**,
defaulting to **Todas**, where approved means `reviewed: true` and pending means
`reviewed: false`. The filter MUST combine with the search query and the displayed
table count MUST reflect the filtered result.

#### Scenario: Filter pending hides approved tables

- **WHEN** the user selects **Pendentes**
- **THEN** only tables with `reviewed: false` are listed
- **AND** the count matches the visible tables

#### Scenario: Filter approved hides pending tables

- **WHEN** the user selects **Aprovadas**
- **THEN** only tables with `reviewed: true` are listed

#### Scenario: Filter and search combine

- **WHEN** the user selects **Pendentes** and types part of a table name
- **THEN** only pending tables matching the query are listed

#### Scenario: Returning to all restores the list

- **WHEN** the user selects **Todas**
- **THEN** every non-removed table is listed again in alphabetical order
