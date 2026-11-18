# Spec Delta — api-keys

## Purpose

Per-user API keys (`dbmp_` prefix) that authenticate MCP clients as their owner on the key-enabled surface, with optional project scope — the credential layer between opencode and the DBMapper API.

## ADDED Requirements

### Requirement: Key issuance

Users with role `MEMBER` or `ADMIN` MUST be able to create their own API key via `POST /api/keys` with a name and optional project scope. The response MUST include the plaintext `dbmp_`-prefixed key exactly once; the server MUST persist only its SHA-256 hash plus a short display prefix, and the plaintext MUST NOT be retrievable afterwards. `VIEWER` MUST receive 403.

#### Scenario: Plaintext is returned exactly once

- **WHEN** a `MEMBER` creates a key via `POST /api/keys`
- **THEN** the response MUST contain the plaintext key starting with `dbmp_`
- **AND** a later `GET /api/keys` MUST NOT return the plaintext or the hash, only the display prefix

#### Scenario: Viewer cannot create keys

- **WHEN** a `VIEWER` calls `POST /api/keys`
- **THEN** the response MUST be the error envelope with status 403

#### Scenario: Key management is audited

- **WHEN** a key is created or revoked
- **THEN** an `events` row MUST record the action with the acting user id

### Requirement: Listing and revoking keys

Users MUST be able to list their own keys (`GET /api/keys`: name, display prefix, project scope, created/expiry/revoked status and `last_used_at` — never secret material) and revoke one with `DELETE /api/keys/:id`. Revocation MUST take effect immediately. Keys MUST be visible only to their owner; another user's key id MUST yield 404 without changing the key.

#### Scenario: List exposes no secret

- **WHEN** the owner lists their keys
- **THEN** each entry MUST show at most the display prefix
- **AND** neither the plaintext nor the hash MUST appear in the response

#### Scenario: Revocation takes effect immediately

- **WHEN** a key is revoked and then presented in an `Authorization` header
- **THEN** the response MUST be 401 with the error envelope

#### Scenario: Foreign keys are invisible

- **WHEN** a user calls `DELETE /api/keys/:id` for a key they do not own
- **THEN** the response MUST be 404 with the error envelope
- **AND** the key MUST remain valid

### Requirement: Bearer authentication

A valid API key (matching a stored hash, not revoked, not expired) presented as `Authorization: Bearer *** MUST authenticate the request as the key's owner — same identity and role as the owner's session — and refresh `last_used_at`. Unknown, revoked or expired keys MUST return 401 with code `INVALID_API_KEY`. Key credentials MUST work only on the key-enabled MCP surface, never on session-only routes.

#### Scenario: Valid key authenticates as its owner

- **WHEN** a valid key calls a key-enabled route
- **THEN** the request MUST succeed with the owner's role enforced
- **AND** the key's `last_used_at` MUST be updated

#### Scenario: Invalid key is rejected

- **WHEN** the header carries an unknown, revoked or expired key
- **THEN** the response MUST be 401 with code `INVALID_API_KEY` and no data

#### Scenario: Key cannot authenticate session-only routes

- **WHEN** a valid key calls `POST /api/users` with no session cookie
- **THEN** the response MUST be 401 with the error envelope

### Requirement: Project scope enforcement

A key created with a project scope MUST only access that project's key-enabled routes. A request for any other project MUST return 403 with the error envelope regardless of whether that project exists, so scope cannot be used to probe for project existence.

#### Scenario: Scoped key is confined

- **WHEN** a key scoped to project A requests project B (existing or not)
- **THEN** the response MUST be 403 with the error envelope

#### Scenario: Unscoped key follows the owner

- **WHEN** a key without a project scope requests any project the owner can access
- **THEN** the request MUST behave exactly as the owner's session would
