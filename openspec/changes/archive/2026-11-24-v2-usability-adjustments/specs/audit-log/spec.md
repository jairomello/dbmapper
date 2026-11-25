## ADDED Requirements

### Requirement: Project rename is audited

Renaming a project MUST append an event inside the same transaction as the
update, with action `project.renamed`, the acting user id, the project id and a
payload carrying the previous and the new name. A rejected rename MUST NOT leave
an event.

#### Scenario: Successful rename appends one event

- **WHEN** a `MEMBER` renames a project
- **THEN** exactly one `events` row with action `project.renamed` is appended
- **AND** its payload contains `from` and `to`

#### Scenario: Failed rename leaves no event

- **WHEN** the rename is rejected by validation or the project does not exist
- **THEN** no `events` row is appended
