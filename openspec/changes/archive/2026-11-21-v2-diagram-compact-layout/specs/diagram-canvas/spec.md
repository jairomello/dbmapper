# Spec Delta

## ADDED Requirements

### Requirement: Zoom range fits large models

The diagram's minimum zoom MUST allow fitting a model of several thousand pixels
of extent into the visible canvas, and the fit action MUST honor that range. The
current zoom level MUST remain readable through the existing zoom controls.

#### Scenario: Large model fits the canvas

- **WHEN** a zone's arranged cards span about six thousand pixels
- **THEN** "Ajustar à tela" fits the whole arrangement inside the visible canvas

#### Scenario: Zoom out goes further than before

- **WHEN** the user repeatedly zooms out
- **THEN** the view can reach at least four times the previous minimum zoom-out level

### Requirement: Minimap legibility

The minimap MUST keep the whole arrangement legible for large models: it MUST be
large enough to show card shapes, distinguish the selected/highlighted cards from
the rest, and indicate the visible viewport without hiding the arrangement.

#### Scenario: Selected card stands out in the minimap

- **WHEN** a table is selected on a large diagram
- **THEN** its minimap node is visually distinct from the others

#### Scenario: Minimap shows the whole arrangement

- **WHEN** a zone with more than one hundred cards is organized
- **THEN** the minimap shows the whole arrangement inside its bounds
