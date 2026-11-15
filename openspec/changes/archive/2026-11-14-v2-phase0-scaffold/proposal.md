# Proposal

## Why

The v2 direction (Bun + React + SQLite server with auth, multi-user, embedded agent and MCP) is approved in `docs/analysis/03-proposta-evolucao-v2.md`, but the repository has no server-side structure yet — v1 lives frozen in `legacy/`. Phase 0 of `ROADMAP.md` lays the foundation every later phase builds on; without it, domain, API, UI and MCP work has nowhere to land.

**Conflict named (per repo rule):** this change introduces `package.json`, Bun workspaces, Biome and a build/test toolchain, which conflicts with the "static-site, no frameworks/build" rule in `AGENTS.md`. That rule is scoped to `legacy/`; the v2 toolchain direction is explicitly approved by the project owner (Jairo, 14/11/2026 — `docs/analysis/03-proposta-evolucao-v2.md` §8, restated in `AGENTS.md` under "Agent-Specific Instructions").

## What Changes

- Add Bun workspace monorepo: `apps/api`, `apps/web`, `apps/mcp`, `packages/` as placeholders for phases 1–5.
- Add TypeScript strict + Biome (lint/format) + `.bun-version`.
- Add Drizzle ORM with SQLite dialect and an explicit migration runner (`bun run db:migrate`).
- Add quality gates adapted from the Azy Board boundary-check pattern: `bun run check` = typecheck → lint → test.
- Add `bun test` harness with a smoke test proving the toolchain runs end to end.
- No feature code: `legacy/` stays frozen; v2 code starts in `apps/`+`packages/` only.

## Capabilities

### New Capabilities
_None — phase 0 is pure tooling (repo structure, lint, migrations runner, gates); no observable product behavior changes._

### Modified Capabilities
_None — the eight v1 capabilities in `openspec/specs/` describe the frozen static app and are untouched._

_(This change declares `skip_specs: true` in `.openspec.yaml`: tooling-only change, zero spec deltas by design — not an oversight.)_

## Non-goals

- Domain model, API endpoints, UI, auth, agent, MCP — all deferred to phases 1–5 (see `ROADMAP.md`).

## Impact

- New root files: `package.json`, `bun.lock`, `biome.json`, `tsconfig.base.json`, `.bun-version`.
- New directories: `apps/{api,web,mcp}`, `packages/` (each with its own `package.json`/`src/`).
- `legacy/` and the JSON contract: unchanged.
- Dependencies: Bun runtime + devDeps (Biome, TypeScript, Drizzle) installed locally — never committed to the share as `node_modules` (work happens in `~/work/dbmapper/` per repo workflow; source lands here).
- Later phases build on these gates; the static-site rule remains in force for `legacy/`.
