# Spec Delta

## ADDED Requirements

### Requirement: Optional card size in the layout document

Each saved position MUST accept an optional `width` and `height` for the card, in
addition to `x` and `y`. Sizes MUST be validated within configured minimum and
maximum bounds, MUST be stored per zone, and MUST be returned unchanged by the
layout `GET`. Documents without sizes MUST remain valid.

#### Scenario: Size round-trips

- **WHEN** a `MEMBER` saves a zone layout with a card at `{ x, y, width, height }`
- **THEN** reading the layout back returns the same width and height for that table

#### Scenario: Out-of-range size is rejected

- **WHEN** a layout PUT carries a width or height outside the allowed bounds
- **THEN** the response is `400` with the standard error envelope and nothing is stored

#### Scenario: Position-only document is accepted

- **WHEN** a layout PUT carries positions with only `x` and `y`
- **THEN** it is accepted and the diagram applies the default size

#### Scenario: Sizes are independent per zone

- **WHEN** two zones store different sizes for the same table
- **THEN** each zone's GET returns its own size
