# Spec Delta — project-api

## ADDED Requirements

### Requirement: Item description update

`PATCH /api/projects/:id/items/:itemType/:itemId/description` with body `{ description }` (itemType ∈ `table` | `column` | `relationship`) MUST set that item's description for role `MEMBER` or `ADMIN`, authenticated by session or API key. `description_source` MUST be derived from the credential: `mcp` for an API key, `human` for a session. Unknown item MUST return 404; `VIEWER` MUST return 403 — both with the error envelope.

#### Scenario: Session write records human source

- **WHEN** a `MEMBER` with a session updates an item's description
- **THEN** the item's `description` MUST equal the new value
- **AND** `description_source` MUST be `human`

#### Scenario: API key write records MCP source

- **WHEN** a request authenticated by API key updates an item's description
- **THEN** `description_source` MUST be `mcp`

#### Scenario: Unknown item and viewer are rejected

- **WHEN** the item id does not exist in the project, or the caller is `VIEWER`
- **THEN** the response MUST be 404 or 403 respectively with the error envelope
- **AND** no description MUST change

### Requirement: Description write review semantics

When a description write changes the value, `reviewed` MUST reset to `false` — an approved item reopens. Writing the identical value MUST NOT change `reviewed`. Every write MUST append an audit event with the acting user id.

#### Scenario: Changing an approved description reopens review

- **WHEN** a write changes the description of an item with `reviewed: true`
- **THEN** `reviewed` MUST become `false`
- **AND** an `events` row MUST record the write with the acting user id

#### Scenario: Identical write keeps review state

- **WHEN** the update sends the value the item already has
- **THEN** `reviewed` MUST remain unchanged
- **AND** an audit event MUST still be appended
