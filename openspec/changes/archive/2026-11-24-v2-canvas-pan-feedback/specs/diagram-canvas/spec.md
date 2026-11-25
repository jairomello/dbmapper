## ADDED Requirements

### Requirement: Temporary pan mode feedback

While the Ctrl key (left or right) is held, the toolbar MUST present **Mover** as
pressed and **Selecionar** as not pressed, without changing the tool that is
restored on release. The pane and cards MUST show a grab cursor in that mode and
a grabbing cursor while the canvas is being dragged. Interactive areas (toolbar,
controls, minimap, menus, dialogs and form fields) MUST NOT start the temporary
pan when pressed.

#### Scenario: Toolbar reflects the temporary mode

- **WHEN** the user holds Ctrl on either side
- **THEN** **Mover** is pressed in the toolbar and **Selecionar** is not

#### Scenario: Releasing restores the toolbar state

- **WHEN** the user releases Ctrl
- **THEN** **Selecionar** is pressed again (unless **Mover** was chosen explicitly)

#### Scenario: Cursor indicates the mode

- **WHEN** Ctrl is held over the pane or a card
- **THEN** the cursor is `grab`
- **AND** while dragging the canvas it becomes `grabbing`

#### Scenario: Interactive controls keep working

- **WHEN** the user presses Ctrl on the toolbar, minimap, controls, a menu or a
  form field
- **THEN** the canvas does not start panning
