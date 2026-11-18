# mcp-server Specification

## Purpose
The stdio MCP server that turns DBMapper into a always-connected tool for opencode: nine tools that read the dictionary map and write descriptions through the API with an API key, a catalog guard that keeps tools documented, and the skill + example config that make the connection reproducible.

## Requirements

### Requirement: Stdio transport and configuration

The server MUST speak MCP over stdio using the official `@modelcontextprotocol/sdk`, configured exclusively from env (`DBMAPPER_API_KEY`, `DBMAPPER_URL`, optional `DBMAPPER_PROJECT_ID`). With missing or invalid configuration the server MUST still start, and every tool call MUST fail with a clear `MCP_CONFIG_ERROR` tool result — never a stack trace and never partial data.

#### Scenario: Configured server lists tools

- **WHEN** the env vars are set and the client initializes the server over stdio
- **THEN** the tool list MUST be returned successfully

#### Scenario: Missing configuration fails safely

- **WHEN** `DBMAPPER_API_KEY` or `DBMAPPER_URL` is absent and a tool is called
- **THEN** the result MUST be `isError: true` with code `MCP_CONFIG_ERROR`
- **AND** no stack trace or internal path MUST appear

### Requirement: Tool catalog

The server MUST register exactly these nine tools — `get_project_overview`, `list_missing_descriptions`, `get_table`, `get_column`, `set_description`, `list_suggestions`, `apply_suggestion`, `reject_suggestion`, `get_export` — each with a description and a JSON Schema input. The catalog MUST be the single source consumed by both the catalog guard and `docs/TOOLS-DBMAPPER.md`.

#### Scenario: ListTools returns the catalog

- **WHEN** the client requests the tool list
- **THEN** exactly the nine tools MUST be returned with their schemas

#### Scenario: Invalid arguments are rejected locally

- **WHEN** a tool is called with arguments violating its JSON Schema (unknown item type, missing required field, forbidden identity key such as `actorUserId` or `apiKeyId`)
- **THEN** the call MUST fail with a validation error BEFORE any API request is made

### Requirement: Read tools

Read tools MUST expose: `get_project_overview` (name, coverage of described/approved items, pending-suggestion count), `list_missing_descriptions` (items whose description is empty, filterable by table and item type), `get_table`/`get_column` (item fields, types, PK/FK flags and neighbouring descriptions) and `get_export` (the v1-contract JSON). Read tools MUST NOT mutate anything.

#### Scenario: Missing descriptions filtered by table

- **WHEN** `list_missing_descriptions` is called with a table filter
- **THEN** only empty-description items of that table MUST be returned

#### Scenario: Column context includes neighbours

- **WHEN** `get_column` is called for a column
- **THEN** the result MUST include the column's type, PK/FK flags and the descriptions of other columns in the same table

### Requirement: set_description tool

The `set_description` tool MUST write through the item description endpoint using the key credential: sets `description`, records `description_source='mcp'`, reopens review when the value changes, and appends an audit event. The tool result MUST include a warning that the value has not been human-reviewed.

#### Scenario: Writing a description via MCP

- **WHEN** `set_description` is called for an undescribed column
- **THEN** the item's description MUST be stored with `description_source='mcp'` and `reviewed=false`
- **AND** the result MUST carry the "não revisado" warning

#### Scenario: Writing over an approved description reopens review

- **WHEN** `set_description` changes the description of an item with `reviewed: true`
- **THEN** `reviewed` MUST become `false`

### Requirement: Suggestion cycle tools

`list_suggestions` MUST return pending suggestions with their stored context. `apply_suggestion` and `reject_suggestion` MUST delegate to the agent's CAS rules under the key owner's role: a suggestion no longer pending MUST surface the API's `409` code as a tool error, never a silent success.

#### Scenario: Applying a pending suggestion through MCP

- **WHEN** `apply_suggestion` is called for a pending suggestion
- **THEN** the suggestion MUST become `applied` and the item MUST be updated per the agent's apply semantics

#### Scenario: Stale decision is a tool error

- **WHEN** `apply_suggestion` targets a suggestion already applied or rejected
- **THEN** the result MUST be `isError: true` carrying code `409`

### Requirement: Error mapping

Every API error envelope received by the adapter MUST become a tool result with `isError: true` carrying the envelope's status, code and message. Stack traces, non-envelope bodies and any key material MUST NOT appear in tool results.

#### Scenario: Envelope becomes a tool error

- **WHEN** the API answers `403 FORBIDDEN` (e.g. VIEWER-owned key attempting a write)
- **THEN** the tool result MUST be `isError: true` with code `FORBIDDEN` and the message

#### Scenario: Unexpected response fails safely

- **WHEN** the API returns a non-JSON or malformed response
- **THEN** the tool result MUST be `isError: true` with a generic safe message
- **AND** no raw body MUST be echoed

### Requirement: Catalog guard

`bun run test:mcp-catalog` MUST exit non-zero when a registered tool is missing from `docs/TOOLS-DBMAPPER.md`, lacks a dispatcher/routing entry, has an invalid schema, or accepts identity arguments; it MUST exit zero on the healthy tree, MUST check that `opencode.json.example` contains no literal key, and MUST run as part of `bun run check`.

#### Scenario: Healthy tree passes

- **WHEN** `bun run test:mcp-catalog` runs on the current repository
- **THEN** it MUST exit 0

#### Scenario: Undocumented tool fails the guard

- **WHEN** the guard is evaluated against a catalog containing a tool without documentation or dispatcher
- **THEN** it MUST exit non-zero naming the offending tool

### Requirement: Skill and example config

The repository MUST ship `skills/dbmapper/SKILL.md` covering the flow discover project → list missing descriptions → analyze the local codebase → write descriptions → report what was written, and `opencode.json.example` configuring the stdio server with `{env:...}` placeholders only. `/opencode.json` MUST be gitignored, and no literal API key MAY appear in tracked files.

#### Scenario: Deliverables exist

- **WHEN** the repository is inspected after this change
- **THEN** `skills/dbmapper/SKILL.md` and `opencode.json.example` MUST exist and the example MUST reference the stdio server command

#### Scenario: No secrets in tracked files

- **WHEN** tracked files are scanned for a literal `dbmp_` key value
- **THEN** no match MUST be found outside test fixtures using obviously fake values
