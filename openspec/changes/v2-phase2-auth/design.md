# Design — v2-phase2-auth

## Context

Fase 1 delivered the dictionary domain behind ports with an error envelope and integration tests on temp SQLite. This change adds identity in front of it. The reference implementation is the Azy Board auth stack (analysis 02, §3): `services/auth.ts` (bcrypt 12 + `jose` JWT HS256), cookie session, `loginThrottle`, `requireRole` middleware — approved for adaptation in the proposal §8 decisions (decision 2: `ADMIN/MEMBER/VIEWER` from the start).

## Goals / Non-Goals

**Goals:** one global role per user; cookie sessions good enough for the React UI in Fase 3; every existing route protected; ADMIN able to manage users; initial admin seeded.

**Non-Goals:** OAuth, password recovery, API keys (Fase 5), per-project memberships, sessions in the persistence ports beyond what routes need, frontend login form (Fase 3).

## Decisions

1. **Cookie session = JWT HS256 (`jose`), HttpOnly, SameSite=Lax, 24h TTL with sliding renewal at 50%** (azyboard's `resolveSessionState` idea, simplified: no absolute cap, no remember-me yet). *Alternative:* server-side sessions table — rejected: extra round-trips and cleanup for no gain at this scale; API keys (Fase 5) reuses the JWT middleware.
2. **bcryptjs (pure JS), cost 12** — same as azyboard, no native build dependency in the workspace.
3. **`JWT_SECRET` from env; dev fallback prints a loud warning and is refused when `NODE_ENV=production`** (azyboard's rule). `.env.example` documents it; no `.env` ever committed (repo rule).
4. **Throttle keeps `login_attempts` in SQLite** (identity + IP, window 15 min, max 5, `Retry-After`) — port of azyboard `loginThrottle` with the table instead of memory, so restarts don't reset attackers' counters.
5. **One blanket protection middleware** (`requireSession`) applied to the `/api` group with an explicit allowlist (`POST /api/auth/login`, `GET /health`), plus `requireRole('MEMBER')` on mutating route groups and `requireRole('ADMIN')` on `/api/users` — one enforcement point instead of per-route decorators, matching the spec's cross-cutting intent.
6. **Single global `users.role`** (no memberships yet): all authenticated users share the dictionary; `VIEWER` = read-only, `MEMBER` = read + mutations, `ADMIN` = + user administration. Project-level memberships stay a documented future option — adding a column + middleware later is additive.
7. **Seed script `bun run db:seed`** creates the initial admin from env (`DBMAPPER_ADMIN_EMAIL`/`DBMAPPER_ADMIN_PASSWORD`) or generates a random password printed once — the bootstrap path for Jairo's first login in Fase 3 testing.
8. **Attribution**: services read the acting user from the request context (`actorUserId`) and set `reviewed_by`/`reviewed_at` when the API flips `reviewed` — the column exists since Fase 1.

## Risks / Trade-offs

- [Existing tests hit routes unauthenticated after this change] → protection added via one allowlist middleware; all Fase 1 suites updated to log in first (a shared test helper issues sessions) — mechanical, caught by `bun run check`.
- [JWT secret leakage or weak default] → production refuses the dev fallback; secret never logged; cookie flags set.
- [Throttle table grows] → rows pruned on read (delete expired window) — bounded by design.
- [Last-admin guard vs seeded single admin] → seed creates exactly one; guard prevents lockout scenarios as more users arrive.

## Migration Plan

Forward-only migration `0002` (`users`, `login_attempts`) applied by `bun run db:migrate`; dev `dev.db` is disposable. Deploy steps: none yet (Fase 6). Rollback: revert the commit and delete `dev.db` — no production data exists. Security note for rollout: `JWT_SECRET` must be set before any real deployment (documented in `.env.example`).
