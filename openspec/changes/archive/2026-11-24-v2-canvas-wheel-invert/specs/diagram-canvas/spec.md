## REMOVED Requirements

### Requirement: Wheel scrolling with modifier keys

**Reason**: A semântica foi invertida para o padrão de canvas (roda rola, Ctrl+roda dá zoom).

**Migration**: Use a nova requirement "Wheel zoom and scrolling"; Ctrl+roda agora dá zoom e a roda sem modificador rola verticalmente.

## ADDED Requirements

### Requirement: Wheel zoom and scrolling

The mouse wheel MUST scroll the canvas vertically when no modifier is held, and
horizontally when Shift is held, without changing the zoom. With Ctrl held, the
wheel MUST zoom around the cursor position. Ctrl MUST take precedence over Shift.
Wheel events over scrollable content inside a card MUST keep scrolling that
content instead of moving the canvas.

#### Scenario: Plain wheel scrolls vertically

- **WHEN** the user scrolls the wheel over the canvas without Ctrl or Shift
- **THEN** the viewport moves vertically
- **AND** the zoom level is unchanged

#### Scenario: Shift + wheel scrolls horizontally

- **WHEN** the user holds Shift and scrolls the wheel over the canvas
- **THEN** the viewport moves horizontally
- **AND** the zoom level is unchanged

#### Scenario: Ctrl + wheel zooms around the cursor

- **WHEN** the user holds Ctrl and scrolls the wheel over the canvas
- **THEN** the zoom changes at the cursor position
- **AND** Ctrl+Shift keeps this zoom behavior

#### Scenario: Scrollable card content keeps its scroll

- **WHEN** the wheel is used over a scrollable column list inside a card
- **THEN** that list scrolls
- **AND** the canvas viewport does not move
