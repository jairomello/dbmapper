# Spec Delta

## ADDED Requirements

### Requirement: Diagram export to image files

The diagram view MUST offer export actions producing a PNG and an SVG file of
the current diagram — cards with their columns and relationship edges — using
client-side rendering; export MUST NOT modify the model, the layout or the
server state.

#### Scenario: PNG download

- **WHEN** the user clicks the PNG export action
- **THEN** a PNG file of the visible diagram is downloaded

#### Scenario: SVG download

- **WHEN** the user clicks the SVG export action
- **THEN** an SVG file containing the cards and edges is downloaded

#### Scenario: Export has no side effects

- **WHEN** either export completes
- **THEN** no save request is sent and the layout is unchanged

### Requirement: Table count in the diagram header

The diagram view MUST show the number of tables in the current model in its
header area, updated whenever the model changes.

#### Scenario: Count matches the model

- **WHEN** a project with 8 non-removed tables opens in the diagram
- **THEN** the header shows `8 tabelas`
