# Proposal

## Why

Phase 2 of `ROADMAP.md`: before the UI (Fase 3) and the agent/MCP (Fases 4–5) exist, the server needs real users — login, roles and protected routes — so multi-user work has identity, every mutation can be attributed, and the review workflow's `reviewed_by` fields finally have someone to point at. Auth is the last foundation layer before the product becomes testable in the browser.

## What Changes

- `users` table (email unique, bcrypt password hash, global role `ADMIN`/`MEMBER`/`VIEWER`) + `login_attempts` for throttling; new migration.
- Session auth ported from the Azy Board reference: bcrypt cost 12, JWT HS256 in an HttpOnly `session` cookie (24h TTL, sliding renewal), login throttle with `Retry-After`, `GET /api/auth/me`, `POST /api/auth/logout`.
- Role enforcement across the existing API: all `/api` routes except `login` and `/health` require a valid session; mutating routes (save, import preview/apply) require `MEMBER`+; user administration requires `ADMIN`; `401`/`403` always use the standard error envelope.
- User administration API (`/api/users`: create, list, update role) restricted to `ADMIN`, plus a `db:seed` script to create the initial admin account.
- Existing authenticated flows gain attribution: `reviewed_by` is set to the acting user when review actions happen through the API.

## Capabilities

### New Capabilities
- `auth`: login/session/logout lifecycle, credential verification and throttling, role-based protection of the whole API surface, and ADMIN-only user administration.

### Modified Capabilities
_None — `project-api` and `model-import` specs describe route behavior under an assumed client; the blanket session requirement lives in `auth` as a cross-cutting requirement (same pattern as the v1 `static-site-security` capability)._

## Non-goals

- OAuth, password reset/recovery, API keys for MCP (Fase 5), invitations/emails, project-level memberships (single global role per user for now), React UI (Fase 3).

## Impact

- New: `apps/api/src/{routes/auth.ts, routes/users.ts, services/auth.ts, services/loginThrottle.ts, middleware/session.ts}`, seed script, migration `0002`.
- Touches existing routes: protection middleware wraps `projects`/`imports` routes (behavior adds `401/403` cases; route logic unchanged).
- `JWT_SECRET` via env with a dev fallback that warns; `.env.example` documents it (no `.env` committed).
- `legacy/` untouched; gates extend with the new suites.
