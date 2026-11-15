## ADDED Requirements

### Requirement: Relationship coverage counters

The status bar MUST display a "FKs" group with three counters that describe the project's foreign-key relationships: total FKs, described FKs (`described/total`), and reviewed FKs (`reviewed/total`). The group MUST appear after the existing "Pendentes" group and MUST reuse the same `.sb-group` / `.sb-label` / `.sb-value` classes used by the other groups.

#### Scenario: Total FKs
- **WHEN** the project has non-`REMOVED` tables with parent relationships
- **THEN** `#sb-total-fks` MUST equal the total number of `parents` across all non-`REMOVED` tables
- **AND** tables with `status: "REMOVED"` MUST NOT contribute to the count

#### Scenario: Described FKs
- **WHEN** the status bar is rendered
- **THEN** `#sb-fk-desc` MUST read `fksDesc/totalFks`
- **AND** a parent relationship MUST count as described only if its `description` is a non-whitespace string

#### Scenario: Reviewed FKs
- **WHEN** the status bar is rendered
- **THEN** `#sb-fk-rev` MUST read `fksRev/totalFks`
- **AND** a parent relationship MUST count as reviewed only if it has a non-empty `description` AND `reviewed: true`

#### Scenario: No FKs
- **WHEN** the project has zero parent relationships across all non-`REMOVED` tables
- **THEN** `#sb-total-fks` MUST read `0`
- **AND** `#sb-fk-desc` MUST read `0/0`
- **AND** `#sb-fk-rev` MUST read `0/0`

#### Scenario: Status bar updates FK counters on every render
- **WHEN** `renderTreeView` runs
- **THEN** `renderStatusBar` MUST run as part of the same call
- **AND** the three FK counter values MUST be recomputed and written to the DOM before the next paint
