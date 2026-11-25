## ADDED Requirements

### Requirement: Temporary pan mode with Ctrl

While the Ctrl key is held, the diagram MUST behave as the **Mover** tool: dragging
the canvas pans the view and table cards MUST NOT be dragged, even when the drag
starts over a card. Releasing Ctrl MUST restore the previous tool behavior
(default **Selecionar**) without requiring a click. Losing window focus or
switching tabs MUST release the temporary mode.

#### Scenario: Ctrl enables pan while held

- **WHEN** a `MEMBER` holds Ctrl and drags on the canvas
- **THEN** the viewport pans instead of moving a table card

#### Scenario: Releasing Ctrl restores card dragging

- **WHEN** the user releases Ctrl
- **THEN** dragging a card header moves the card again
- **AND** the active toolbar tool is unchanged

#### Scenario: Focus loss resets the modifier

- **WHEN** the window loses focus while Ctrl is held
- **THEN** the temporary pan mode is turned off

### Requirement: Wheel scrolling with modifier keys

With **Ctrl** held, the mouse wheel MUST pan the viewport vertically instead of
zooming. With **Shift** held, it MUST pan horizontally. With both, it MUST pan on
both axes. Without a modifier, the wheel MUST keep the existing zoom behavior.
The page MUST NOT zoom or scroll while the modified wheel is handled by the
canvas.

#### Scenario: Ctrl + wheel pans vertically

- **WHEN** the user holds Ctrl and scrolls the wheel down over the canvas
- **THEN** the viewport moves vertically and the zoom level is unchanged

#### Scenario: Shift + wheel pans horizontally

- **WHEN** the user holds Shift and scrolls the wheel down over the canvas
- **THEN** the viewport moves horizontally and the zoom level is unchanged

#### Scenario: Plain wheel still zooms

- **WHEN** the user scrolls the wheel without Ctrl or Shift
- **THEN** the canvas zooms as before
