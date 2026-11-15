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
