## MODIFIED Requirements

### Requirement: Cross-consumer JSON contract

The same JSON shape produced by DBMapper's export MUST be consumable by DBViewer and by any future consumer, without any field renaming or version negotiation.

#### Scenario: DBViewer reads a DBMapper export
- **WHEN** a JSON file produced by `exportProjectJSON` is opened in `dbviewer.html`
- **THEN** the viewer MUST render the database name, every non-`REMOVED` table, and its columns
- **AND** the viewer MUST display the parent/child relationships using the `parents` and `children` arrays from the JSON

### Requirement: Capability Purpose paragraph

The `## Purpose` section of this spec MUST describe the capability in 1–3 behavior-oriented sentences, must NOT contain the placeholder `TBD - created by archiving`, and MUST name the executable test script (if any) and the cross-cutting `project-persistence` contract (if relevant).

#### Scenario: Purpose paragraph is non-placeholder

- **WHEN** a reader opens this spec file
- **THEN** the `## Purpose` section MUST NOT contain the string `TBD - created by archiving`
- **AND** the section MUST contain at least one complete sentence describing the capability's user-facing responsibility

## ADDED Requirements

### Requirement: Viewer consumer reference uses the corrected name

The cross-consumer JSON contract MUST name the viewer consumer as `DBViewer` and reference its file as `dbviewer.html`. The misspelled `DBViewr` / `dbviewr.html` references MUST NOT appear in this spec or in any other shipped artifact that points at the viewer.

#### Scenario: Viewer consumer reference is spelled correctly

- **WHEN** a reader inspects `project-persistence/spec.md` or any cross-reference to the viewer consumer in shipped artifacts
- **THEN** the artifact MUST NOT contain the substrings `DBViewr` or `dbviewr.html` when referring to the viewer
