# Tasks

## 1. Schema e migração de identidade

- [ ] 1.1 Add `users` (email unique, `password_hash`, `role` enum ADMIN/MEMBER/VIEWER, timestamps) and `login_attempts` to `apps/api/src/db/schema.ts` and verify `bun run db:generate` produces migration `0002`
- [ ] 1.2 Extend the migration test to assert both tables, the unique email index and role checks on a temp database and verify `bun test apps/api` passes

## 2. Serviços de auth

- [ ] 2.1 Create `src/services/auth.ts` (bcryptjs hash/compare cost 12, `signJwt`/`verifyJwt` HS256 via `jose`, session cookie options with 24h sliding TTL, `JWT_SECRET` env with dev fallback that warns and refuses `NODE_ENV=production`) and verify unit tests cover hash/verify round-trip, token round-trip, and production refusal of the fallback
- [ ] 2.2 Create `src/services/loginThrottle.ts` backed by `login_attempts` (5 failures / 15 min per identity, expired rows pruned) and verify tests cover blocked-after-5 with `Retry-After`, reset after success, and independent identities
- [ ] 2.3 Create `.env.example` documenting `JWT_SECRET`, `DBMAPPER_ADMIN_EMAIL` and `DBMAPPER_ADMIN_PASSWORD` and verify no `.env` file is tracked by git

## 3. Rotas e middleware de sessão

- [ ] 3.1 Create `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` and verify tests cover successful login sets HttpOnly cookie without the hash, generic `401` for wrong-password and unknown-email, `me` with/without session, and logout clearing
- [ ] 3.2 Create `requireSession` (allowlist: login + health) and `requireRole('MEMBER'|'ADMIN')` middleware, wrap the existing `projects`/`imports` route groups, and verify tests cover `401` unauthenticated, `403` VIEWER on PUT/preview/apply, `200` VIEWER on reads, and that Fase 1 suites pass with a logged-in helper
- [ ] 3.3 Wire the authenticated actor into services so `reviewed_by`/`reviewed_at` are set when the API flips review state and verify a test asserts the acting user is recorded

## 4. Administração de usuários

- [ ] 4.1 Create `/api/users` (POST create, GET list, PATCH role) behind `requireRole('ADMIN')` with Zod validation (password minimum length) and verify tests cover admin creates/lists/updates, non-admin gets `403`, response never contains `password_hash`
- [ ] 4.2 Implement the last-admin guard and verify a test asserts demoting the only `ADMIN` fails with `400` and the role is unchanged

## 5. Seed do admin inicial

- [ ] 5.1 Create `bun run db:seed` creating the initial admin from env (or generating and printing a random password once) and verify running it against a temp database creates exactly one `ADMIN` and is idempotent on re-run

## 6. Documentação

- [ ] 6.1 Document auth (login flow, roles matrix, seed command, `JWT_SECRET`) in `README.md` and `AGENTS.md` and verify every documented command runs as written

## 7. Gates

- [ ] 7.1 Run `bun run check` and verify it exits 0 with the auth suites included
- [ ] 7.2 Verify `legacy/` is untouched: `git status legacy/` shows no changes and the five `node tests/*.test.js` still print `ok` from `legacy/`

## 8. Validate

- [ ] 8.1 Run `openspec validate v2-phase2-auth --strict` and confirm it exits 0
- [ ] 8.2 Run `bun run check` in `~/work/dbmapper/` one final time and confirm it exits 0

## 9. Archive

- [ ] 9.1 Copy source only (never `node_modules` or build output) from `~/work/dbmapper/` to the share and commit with an imperative message
- [ ] 9.2 Mark Fase 2 as ✅ in `ROADMAP.md` and commit the roadmap update
- [ ] 9.3 Run `openspec archive v2-phase2-auth --yes` to move the change under `openspec/changes/archive/` (including the promoted `auth` spec)

## Workflow follow-up

- Stop here and wait for Jairo's ok before starting Fase 3 (`ROADMAP.md` gate).
