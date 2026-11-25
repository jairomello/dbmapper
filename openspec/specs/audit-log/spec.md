# audit-log Specification

## Purpose
A complete, append-only audit trail of every mutation — who changed what, when — with an ADMIN query surface in the API and in the web UI.

## Requirements

### Requirement: Mutations emit events

Every mutating endpoint MUST append a row to `events` inside the same transaction as the mutation, with the acting user id, a namespaced action (`domain.verb`), the subject ids and a timestamp. Coverage includes: project create/save/JSON import, SQL model import apply, diagram layout save, item description write, agent decisions, key create/revoke, user create and role change, and DDL baseline capture. A mutation that rolls back MUST NOT leave an event.

#### Scenario: Project save is recorded

- **WHEN** a `MEMBER` saves a project model
- **THEN** an `events` row MUST exist with action `project.saved`, the actor id and the project id

#### Scenario: Diagram layout save is recorded

- **WHEN** a `MEMBER` saves a project's diagram layout
- **THEN** an `events` row MUST exist with action `diagram.layout_saved`, the actor id and the project id

#### Scenario: DDL baseline capture is recorded

- **WHEN** a `MEMBER` captures or refreshes a project's DDL baseline
- **THEN** an `events` row MUST exist with action `ddl.baseline_captured`, the actor id and the project id

#### Scenario: User role change is recorded

- **WHEN** an `ADMIN` changes a user's role
- **THEN** an `events` row MUST exist with action `user.role_changed`, the actor id and the target user id in the payload

#### Scenario: Every mutating route is covered

- **WHEN** each registered mutating route is exercised in the test suite
- **THEN** each MUST produce at least one `events` row with a `domain.verb` action
- **AND** a failed mutation MUST produce none

### Requirement: Events are append-only

The persistence layer MUST expose only insert and list operations for `events`; no update or delete path MAY exist for any role, including `ADMIN`.

#### Scenario: No mutation path exists for events

- **WHEN** the persistence API is inspected
- **THEN** no method MUST update or delete rows in `events`

### Requirement: Audit query API

`GET /api/events` MUST be `ADMIN`-only and return events newest-first with the actor's email resolved, supporting filters `action` (prefix match), `projectId`, and `limit` (default 100, maximum 500).

#### Scenario: Admin lists recent events

- **WHEN** an `ADMIN` calls `GET /api/events`
- **THEN** the response MUST be events ordered by `created_at` descending with actor emails
- **AND** `limit` MUST default to 100 and cap at 500

#### Scenario: Non-admin is rejected

- **WHEN** a `MEMBER` or `VIEWER` calls `GET /api/events`
- **THEN** the response MUST be 403 with the error envelope

#### Scenario: Action prefix filter works

- **WHEN** the query passes `action=agent.`
- **THEN** ONLY events whose action starts with `agent.` MUST be returned

### Requirement: Audit UI

The web app MUST expose an `/audit` route visible only to `ADMIN`, listing events (actor, action, subject, timestamp) with an action-family filter and an empty state; non-admin users MUST be redirected away.

#### Scenario: Admin sees the audit list

- **WHEN** an `ADMIN` opens `/audit`
- **THEN** the table MUST show recent events with actor, action and date

#### Scenario: Member is redirected

- **WHEN** a `MEMBER` opens `/audit`
- **THEN** they MUST be redirected out of the route (to the gallery)

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
