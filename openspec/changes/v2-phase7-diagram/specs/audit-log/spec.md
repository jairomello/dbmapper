# Spec Delta

## MODIFIED Requirements

### Requirement: Mutations emit events

Every mutating endpoint MUST append a row to `events` inside the same transaction as the mutation, with the acting user id, a namespaced action (`domain.verb`), the subject ids and a timestamp. Coverage includes: project create/save/JSON import, SQL model import apply, diagram layout save, item description write, agent decisions, key create/revoke, user create and role change. A mutation that rolls back MUST NOT leave an event.

#### Scenario: Project save is recorded

- **WHEN** a `MEMBER` saves a project model
- **THEN** an `events` row MUST exist with action `project.saved`, the actor id and the project id

#### Scenario: Diagram layout save is recorded

- **WHEN** a `MEMBER` saves a project's diagram layout
- **THEN** an `events` row MUST exist with action `diagram.layout_saved`, the actor id and the project id

#### Scenario: User role change is recorded

- **WHEN** an `ADMIN` changes a user's role
- **THEN** an `events` row MUST exist with action `user.role_changed`, the actor id and the target user id in the payload

#### Scenario: Every mutating route is covered

- **WHEN** each registered mutating route is exercised in the test suite
- **THEN** each MUST produce at least one `events` row with a `domain.verb` action
- **AND** a failed mutation MUST produce none
