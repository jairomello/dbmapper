# auth Specification

## Purpose
Establish identity for the whole v2 API: credential login into an HttpOnly session cookie, session lifecycle with throttled failures, blanket role-based protection of every other route, and ADMIN-only user administration. Executable coverage: auth and route-protection suites in `apps/api` (`bun test`).

## Requirements

### Requirement: Login establishes a session

`POST /api/auth/login` with valid `email` and `password` MUST set an HttpOnly `session` cookie (JWT HS256, 24h TTL with sliding renewal) and return the user without the password hash. Invalid credentials MUST use the standard error envelope and MUST NOT reveal whether the email exists.

#### Scenario: Successful login
- **WHEN** `POST /api/auth/login` is called with a registered email and the correct password
- **THEN** the response is `200` with `{ id, email, role }`, a `Set-Cookie` header for `session` with `HttpOnly` and `SameSite` attributes, and no password hash appears anywhere in the response

#### Scenario: Invalid credentials are generic
- **WHEN** login is attempted with a wrong password for a registered email, or with an unregistered email
- **THEN** both attempts return the same `401` error envelope message, differing in no other observable way

#### Scenario: Login is throttled
- **WHEN** the same identity fails login repeatedly (default: 5 failures within 15 minutes)
- **THEN** further attempts return `429` with `Retry-After` and the standard error envelope, and a successful login in between resets the counter

### Requirement: Session lifecycle

A logged-in client MUST be able to read its identity via `GET /api/auth/me` and end the session via `POST /api/auth/logout` (cookie cleared). Requests with a missing, malformed or expired session MUST receive `401` with the error envelope.

#### Scenario: me returns the current user
- **WHEN** `GET /api/auth/me` is called with a valid session cookie
- **THEN** the response contains `{ id, email, role }`

#### Scenario: Expired or absent session
- **WHEN** `GET /api/auth/me` is called without a session cookie, or with an expired/tampered token
- **THEN** the response is `401` with the standard error envelope

#### Scenario: Logout clears the session
- **WHEN** `POST /api/auth/logout` is called with a valid session
- **THEN** the cookie is cleared and a subsequent `GET /api/auth/me` returns `401`

### Requirement: Role-based route protection

Every `/api` route except `POST /api/auth/login` and `GET /health` MUST require a valid session. Mutating operations (project save, JSON import, import preview/apply) MUST additionally require role `MEMBER` or `ADMIN`; `VIEWER` may only read. Insufficient role MUST return `403`; unauthenticated MUST return `401` — both with the error envelope.

#### Scenario: Unauthenticated request is rejected
- **WHEN** any protected endpoint is called without a session cookie
- **THEN** the response is `401` with the standard error envelope and no data is returned or changed

#### Scenario: Viewer cannot mutate
- **WHEN** a user with role `VIEWER` calls `PUT /api/projects/{id}` or the import apply endpoint
- **THEN** the response is `403` with the standard error envelope and the stored model is unchanged

#### Scenario: Viewer can read
- **WHEN** a user with role `VIEWER` calls `GET /api/projects` or the export endpoint
- **THEN** the response is `200` with the data

### Requirement: ADMIN-only user administration

`ADMIN` users MUST be able to create users (`email`, `password`, `role`), list users, and change a user's role via `/api/users`. Non-admins MUST receive `403`. The system MUST refuse to remove or demote the last remaining `ADMIN`.

#### Scenario: Admin creates a user
- **WHEN** an `ADMIN` calls `POST /api/users` with a valid email, a password meeting the minimum length, and a role
- **THEN** the user is created with the bcrypt hash stored and the response returns `{ id, email, role }` without the hash

#### Scenario: Non-admin is rejected
- **WHEN** a `MEMBER` or `VIEWER` calls any `/api/users` endpoint
- **THEN** the response is `403` with the standard error envelope

#### Scenario: Last admin cannot be demoted
- **WHEN** an `ADMIN` attempts to change the role of the only remaining `ADMIN` account
- **THEN** the request fails with `400` and the standard error envelope, and the user's role is unchanged
