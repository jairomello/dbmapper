# Spec Delta

## ADDED Requirements

### Requirement: Automatic layout options

The diagram MUST offer automatic organization with at least two algorithms:
`Em grade` (rows and columns, current behavior) and `Em estrela` (most connected
table at the center, the others arranged in rings by relationship level, with
unrelated tables placed in a side strip). Both MUST be deterministic for the
same model, MUST NOT overlap cards, and MUST respect a minimum gap between
cards.

#### Scenario: Grid layout arranges all cards

- **WHEN** a `MEMBER` applies `Em grade`
- **THEN** every table of the active zone is placed on a regular grid without overlap
- **AND** repeating the action produces the same positions

#### Scenario: Star layout centers the hub

- **WHEN** a `MEMBER` applies `Em estrela` on a zone where `alocacao` has the most connections
- **THEN** `alocacao` is placed at the center
- **AND** its direct neighbors form the first ring
- **AND** tables with no relationship are placed in a side strip

#### Scenario: Overlap is prevented

- **WHEN** two tables have similar names and the same connection level
- **THEN** their cards do not overlap

### Requirement: Automatic layout is persisted like a manual arrangement

Applying an automatic layout MUST persist the resulting positions, the viewport
and the zoom through the existing layout endpoint in a single write, auditing
exactly one save, and MUST fit the view to the arranged cards afterwards. A
`VIEWER` MUST NOT be able to apply an automatic layout.

#### Scenario: One write per layout application

- **WHEN** a `MEMBER` applies `Em estrela`
- **THEN** one layout save is sent with the new positions
- **AND** exactly one layout save event is appended

#### Scenario: View is fitted after organizing

- **WHEN** the automatic layout finishes
- **THEN** the viewport is fitted to the arranged cards

#### Scenario: Viewer cannot reorganize

- **WHEN** a `VIEWER` opens the diagram
- **THEN** the automatic layout actions are not available and no save is sent
