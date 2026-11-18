# Spec Delta — auth

## MODIFIED Requirements

### Requirement: Role-based route protection

Every `/api` route except `POST /api/auth/login` and `GET /health` MUST require a valid credential: a session cookie or, on the key-enabled MCP surface only, an API key as defined by `api-keys`. Mutating operations (including agent decisions and item description write) MUST additionally require role `MEMBER` or `ADMIN`; `VIEWER` may only read. Insufficient role MUST return `403`; unauthenticated MUST return `401` — both with the error envelope.

#### Scenario: Unauthenticated request is rejected

- **WHEN** any protected endpoint is called without a session cookie and without a valid API key
- **THEN** the response is `401` with the standard error envelope and no data is returned or changed

#### Scenario: Viewer cannot mutate

- **WHEN** a user with role `VIEWER` calls `PUT /api/projects/{id}` or the import apply endpoint
- **THEN** the response is `403` with the standard error envelope and the stored model is unchanged

#### Scenario: Viewer can read

- **WHEN** a user with role `VIEWER` calls `GET /api/projects` or the export endpoint
- **THEN** the response is `200` with the data

#### Scenario: Valid API key authenticates the MCP surface

- **WHEN** a request carries a valid `Authorization: Bearer *** to a key-enabled route
- **THEN** it MUST be authenticated as the key's owner with the owner's role enforced

## ADDED Requirements

### Requirement: Session-only routes reject key credentials

Routes outside the key-enabled surface (login/logout/me and user administration) MUST NOT accept API-key credentials: with only a Bearer header and no session cookie they MUST return `401` with the error envelope. No request MAY change the acting identity through client-supplied arguments (body, query or header) — the credential alone decides who acts.

#### Scenario: Key-only call to a session-only route fails

- **WHEN** a valid API key calls `POST /api/users` with no session cookie
- **THEN** the response is `401` with the standard error envelope

#### Scenario: Client-supplied identity is ignored

- **WHEN** a key-enabled request carries an argument claiming a different user (e.g. `actorUserId` or `userId`)
- **THEN** the acting user MUST remain the key's owner
- **AND** the supplied identity MUST NOT be stored in the audit event
