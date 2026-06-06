## ADDED Requirements

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
