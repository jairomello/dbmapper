# Spec Delta

## ADDED Requirements

### Requirement: Compact automatic layout

Automatic layout MUST produce a compact arrangement: the bounding box of the
arranged cards MUST stay within the same order of magnitude as a packed grid of
the same tables, regardless of how tall the tallest card is. Ring placement MUST
NOT scale the radius by the tallest card's height, and cards MUST NOT overlap
after organizing.

#### Scenario: Tall card does not inflate the layout

- **WHEN** a zone contains one very tall table (over 2 000 px) among average cards
- **THEN** the arranged bounding box stays within roughly the area the same tables would occupy in a packed grid
- **AND** no card overlaps another

#### Scenario: Star rings keep neighbors close

- **WHEN** `Em estrela` is applied
- **THEN** the table with the most connections is centered
- **AND** the cards most related to it occupy the positions nearest the center, in relationship-level order
- **AND** tables with no relationship are placed in a side strip

#### Scenario: Grid adapts to table count

- **WHEN** `Em grade` is applied to a zone with one hundred tables
- **THEN** the number of columns is derived from the count so the result is roughly square instead of a narrow column

#### Scenario: Layout stays deterministic

- **WHEN** the same zone is organized twice, or with the tables in a different input order
- **THEN** the resulting positions are identical
