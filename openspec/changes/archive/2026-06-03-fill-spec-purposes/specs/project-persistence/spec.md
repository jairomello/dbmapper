## ADDED Requirements

### Requirement: Capability Purpose paragraph
The `## Purpose` section of this spec MUST describe the capability in 1–3 behavior-oriented sentences, must NOT contain the placeholder `TBD - created by archiving`, and MUST name the executable test script (if any) and the cross-cutting `project-persistence` contract (if relevant).

#### Scenario: Purpose paragraph is non-placeholder
- **WHEN** a reader opens this spec file
- **THEN** the `## Purpose` section MUST NOT contain the string `TBD - created by archiving`
- **AND** the section MUST contain at least one complete sentence describing the capability's user-facing responsibility
