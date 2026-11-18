# project-api Specification

## Purpose
Expose dictionary projects over the REST API: create, list, get and save the full semantic model, export it in the exact v1 JSON contract consumed by DBViewer and downstream agents, and import legacy v1 JSON with backfill — all under the standard error envelope. Executable coverage: API integration tests in `apps/api` (`bun test`).

## Requirements

### Requirement: Project CRUD

The API MUST let clients create a project, list projects, fetch one project's full model, and replace a project's model with a validated payload.

#### Scenario: Create a project
- **WHEN** `POST /api/projects` is called with a valid `name`
- **THEN** the project is stored with an empty model (`tables: []`) and the response contains its `id`, `name` and timestamps

#### Scenario: List projects
- **WHEN** `GET /api/projects` is called
- **THEN** every stored project is returned with at least `id` and `name`

#### Scenario: Get one project
- **WHEN** `GET /api/projects/{id}` is called for an existing project
- **THEN** the response contains the full stored model (tables, columns, relationships)

#### Scenario: Save replaces the model
- **WHEN** `PUT /api/projects/{id}` is called with a well-formed model
- **THEN** the stored model is replaced by the payload, with relationships normalized (`children` always derived from `parents`)

#### Scenario: Unknown project
- **WHEN** a project endpoint is called with an id that does not exist
- **THEN** the response is `404` with the standard error envelope and nothing is changed

### Requirement: Export in the v1 JSON contract

The API MUST export a project as `{"database": {...}}` matching the v1 contract field-for-field: `database.name/description/business_terms/tables`, each table with `name/description/business_terms/status/relationships{parents,children}/columns`, and each column with `name/type/primary_key/foreign_key/description/business_terms`.

#### Scenario: Export matches the v1 shape
- **WHEN** the export endpoint is called for a project created through the API
- **THEN** the response body parses as `{"database": {...}}` and every table and column carries the v1 fields above with their defaults filled in

#### Scenario: Children are derived
- **WHEN** the export is generated
- **THEN** every table's `relationships.children` is the exact inverse of the referenced tables' `parents` entries (never stale or duplicated)

### Requirement: Import of v1 JSON

The API MUST accept a v1 project JSON and store it, backfilling any fields an older export omits, and MUST reject payloads without a `database` object using the error envelope without storing anything.

#### Scenario: Legacy JSON imports cleanly
- **WHEN** a v1 export missing optional fields (e.g. `reviewed`, `business_terms`) is submitted
- **THEN** the stored model contains those fields backfilled with defaults (`description: ""`, `business_terms: []`, `reviewed: false`, `status: "UNCHANGED"`)

#### Scenario: Invalid payload is rejected atomically
- **WHEN** the payload has no `database` object
- **THEN** the response is `400` with the standard error envelope and the stored project is unchanged

### Requirement: Standard error envelope

All error responses MUST use the envelope `{ "error": { "code", "message", "retryable", "details" } }` with `retryable` set appropriately, for REST and future MCP/agent reuse.

#### Scenario: Validation failure uses the envelope
- **WHEN** any project endpoint receives an invalid payload
- **THEN** the response body contains `error.code`, `error.message` and `error.retryable`, and no stack trace or SQL is exposed

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
