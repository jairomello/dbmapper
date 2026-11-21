# Spec Delta

## ADDED Requirements

### Requirement: Optional direct-neighbor focus
The diagram MUST offer an optional focus on a selected table and its direct relationships, with a control to return to the complete active zone. Focus MUST NOT change persisted positions, memberships, viewport or model.

#### Scenario: Enter and leave focus
- **WHEN** the user focuses a selected table
- **THEN** the table and its direct neighbors and relationships are shown
- **AND** returning to the complete zone restores the previous view

#### Scenario: Focus is read only
- **WHEN** a VIEWER uses focus
- **THEN** no layout or model write is sent

### Requirement: Diagram detail levels
The diagram MUST allow a compact presentation showing table names and relationship endpoints and a detailed presentation exposing all columns in model order. Detail changes MUST preserve selectable columns and unambiguous relationship endpoints through an accessible path to the detailed presentation.

#### Scenario: Inspect a hidden column
- **WHEN** a user selects a column from search or the tree while its card is compact
- **THEN** the column becomes visible and selected in the corresponding card

### Requirement: Metadata panel alongside diagram
The diagram MUST provide a collapsible metadata panel alongside the canvas when space permits and an accessible alternative for narrower screens. Selection MUST remain synchronized across tree, diagram and panel.

#### Scenario: Select a column
- **WHEN** a user selects a column in the diagram
- **THEN** its metadata appears in the panel without leaving the diagram
- **AND** its selected state is visible in the tree
