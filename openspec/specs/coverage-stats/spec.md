# coverage-stats Specification

## Purpose
Computes the at-a-glance metrics shown in the status bar: total tables and columns, described and reviewed coverage for each, the pending count, the overall review progress percentage with color thresholds, and the relationship coverage counters (total, described, reviewed) for foreign keys. The bar is recomputed on every tree re-render so it stays in sync with `project-persistence` and the `schema-tree`. The executable contract is `tests/coverage-stats.test.js`.
## Requirements
### Requirement: Status bar totals

The status bar MUST always show the number of tables and the number of columns currently in the project, ignoring tables marked `REMOVED`.

#### Scenario: Totals reflect active tables only
- **WHEN** the project has a mix of `REMOVED` and non-`REMOVED` tables
- **THEN** `#sb-total-tables` MUST equal the number of non-`REMOVED` tables
- **AND** `#sb-total-cols` MUST equal the total columns across those non-`REMOVED` tables

#### Scenario: Totals update on render
- **WHEN** the tree is re-rendered after a project load, an import, an update, or any state change
- **THEN** the totals in the status bar MUST be recomputed before the next paint

### Requirement: Described coverage counters

The status bar MUST show how many tables and how many columns currently have a non-empty description, formatted as `described/total`.

#### Scenario: Format and source
- **WHEN** the status bar is rendered
- **THEN** `#sb-desc-tables` MUST read `descTables/totalTables`
- **AND** `#sb-desc-cols` MUST read `descCols/totalCols`
- **AND** an item MUST count as described only if its `description` is a non-whitespace string

### Requirement: Reviewed coverage counters

The status bar MUST show how many tables and how many columns are both described and `reviewed: true`, formatted as `reviewed/total`.

#### Scenario: Reviewed implies described
- **WHEN** computing the reviewed count
- **THEN** an item MUST count as reviewed only if it has a non-empty description AND `reviewed: true`
- **AND** `#sb-rev-tables` MUST read `revTables/totalTables`
- **AND** `#sb-rev-cols` MUST read `revCols/totalCols`

### Requirement: Pending counter and overall progress

The status bar MUST show the total number of items still pending review and a percentage representing overall review progress, with a color class that changes at fixed thresholds.

#### Scenario: Pending count
- **WHEN** the status bar is rendered
- **THEN** `#sb-pending` MUST equal `(totalTables - revTables) + (totalCols - revCols)`

#### Scenario: Progress percentage
- **WHEN** there is at least one reviewable item
- **THEN** `#sb-progress-pct` MUST show the integer percentage of `reviewed / reviewable` rounded to the nearest whole number
- **AND** `#sb-progress-fill` MUST have its `width` set to that percentage

#### Scenario: No items
- **WHEN** the project has zero tables
- **THEN** `#sb-progress-pct` MUST show `0%`
- **AND** the progress fill MUST be empty

#### Scenario: Color thresholds
- **WHEN** the computed percentage is below 30
- **THEN** the progress fill MUST have the `pct-low` class
- **WHEN** the percentage is between 30 (inclusive) and 70 (exclusive)
- **THEN** the fill MUST have the `pct-mid` class
- **WHEN** the percentage is 70 or above
- **THEN** the fill MUST have the `pct-high` class

### Requirement: Status bar reflects every state change

The status bar MUST be re-rendered whenever the tree is re-rendered, so all counters stay in sync with the project state.

#### Scenario: Re-render on tree updates
- **WHEN** `renderTreeView` runs
- **THEN** `renderStatusBar` MUST run as part of the same call
- **AND** no manual counter update is required by the caller

#### Scenario: Database name in status bar is clickable
- **WHEN** the user clicks the database name in the status bar
- **THEN** the editor MUST open with the database root selected

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

### Requirement: Capability Purpose paragraph
The `## Purpose` section of this spec MUST describe the capability in 1–3 behavior-oriented sentences, must NOT contain the placeholder `TBD - created by archiving`, and MUST name the executable test script (if any) and the cross-cutting `project-persistence` contract (if relevant).

#### Scenario: Purpose paragraph is non-placeholder
- **WHEN** a reader opens this spec file
- **THEN** the `## Purpose` section MUST NOT contain the string `TBD - created by archiving`
- **AND** the section MUST contain at least one complete sentence describing the capability's user-facing responsibility

