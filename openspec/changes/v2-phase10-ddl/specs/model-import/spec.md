# Spec Delta

## ADDED Requirements

### Requirement: Import apply captures the DDL baseline

Applying a confirmed SQL import MUST store the imported structure as the
project's DDL baseline in the same transaction as the model write, replacing any
previous baseline, and MUST audit the capture. The baseline MUST contain only
structure (names, types, primary and foreign keys) — documentation is never part
of it.

#### Scenario: Baseline follows the applied import

- **WHEN** a `MEMBER` applies a SQL import that adds a table
- **THEN** the project baseline contains that table with its columns and keys
- **AND** an `ddl.baseline_captured` event is written for the project

#### Scenario: Failed apply leaves the baseline untouched

- **WHEN** the import apply fails and rolls back
- **THEN** the previous baseline is unchanged
- **AND** no `ddl.baseline_captured` event is appended
