## Context

The `bootstrap-initial-specs` change archived seven capabilities, of which three (`sql-import`, `model-update-wizard`, `dbviewr`) lean on Node `assert` scripts as their executable surface. Two of those scripts exist (`tests/update-model.test.js`, `tests/dbviewr.test.js`); the third, a parser-specific script, does not — the parser is currently exercised only through the wizard test. The same archived change left two follow-up items in its housekeeping list: reconcile the `AGENTS.md` "no automated tests" sentence with reality (6.1), and decide whether to add a dedicated parser test file (6.2). We are resolving both items in this change. The decision recorded in the conversation is to add a dedicated parser test rather than continue relying solely on the wizard tests.

The repo is a static, framework-free site. Tests are ad-hoc Node scripts invoked directly with `node tests/foo.js`; there is no `package.json` test script, no runner, and no CI. That constraint is preserved here.

## Goals / Non-Goals

**Goals:**

- Introduce `tests/sql-import.test.js` that exercises `parseSQLToTables`, `parseAlterTableForeignKeys`, and `normalizeRelationships` against the scenarios already in the `sql-import` spec, using the same `node:assert/strict` style as the existing two scripts.
- Edit `AGENTS.md` to remove the "no automated tests are currently configured" sentence and replace it with a section that names each `tests/*.test.js` script as the executable contract for its capability, and instructs future agents to run the relevant test before considering a change done.
- Add a `Parser test contract` Requirement to the `sql-import` spec, with one or more scenarios that lock in the new test file as the executable surface for the capability.
- Keep the change small and reviewable: no new test framework, no `package.json`, no CI, no source code refactor.

**Non-Goals:**

- Refactoring or splitting `app.js`.
- Adding a test framework, a `package.json` `test` script, or any CI configuration.
- Modifying the existing two test scripts (`tests/update-model.test.js`, `tests/dbviewr.test.js`).
- Modifying the `model-update-wizard` or `dbviewr` specs — both already reference their respective test files correctly.
- Filling in the `## Purpose` paragraph of any spec — that is a separate follow-up change (`fill-spec-purposes`).

## Decisions

- **Test style: same as the existing two scripts.** Each script uses `node:assert/strict`, `require('../app.js')` to pull the parser functions, and a final `console.log('<file>: ok')` on success. The new script follows that exact pattern, with one `assert.*` block per scenario. We do not introduce describe/it/suite helpers, fixtures, or external deps.
- **Test scope: every `sql-import` spec scenario that is feasible to assert from a SQL string.** That covers the 14 scenarios across the 5 existing Requirements: column extraction, inline PK, inline FK, named FK, quoted identifiers, parens in types, ALTER TABLE adding two FKs, ALTER TABLE on a missing table (skip path), parent↔child normalization, and duplicate deduplication. The "no CREATE TABLE" scenario is covered indirectly (parser throws) but not asserted at the toast level, since the toast lives in the DOM layer.
- **Where the new Requirement lives: under `## ADDED Requirements` in the `sql-import` delta spec.** The skill instructions warn that `MODIFIED` must include the full updated content of every changed block. We are not changing any of the existing 5 Requirements' text or scenarios, so we use `ADDED` for the new one and leave the existing 5 untouched (no `MODIFIED` block at all). This avoids the brittle "copy full block and edit" path and is closer to the natural shape of the change.
- **`AGENTS.md` edit is content-only, no structural change.** The current section lists "No automated tests are currently configured" followed by a manual verification checklist. The edit keeps the manual checklist (it is still useful for visual changes) and inserts a paragraph above it that names the three scripts. The "For SQL parser changes, test at least one file with constraints and one with multiple tables" line stays in the manual section because it is about manual flow, not about the test scripts.
- **No `## Purpose` edit on the `sql-import` spec.** The `## Purpose` paragraph is currently a `TBD` placeholder. Filling it in is a separate change (`fill-spec-purposes`) so that this change stays focused on the testing contract. We mention this in the proposal as a known follow-up.

## Risks / Trade-offs

- **[Risk] The new test file duplicates parser coverage that the wizard test already exercises.** → Mitigation: yes, on purpose. The wizard test exercises the parser as a side effect; the new test exercises it as the unit under test, with no wizard state in scope. If a future refactor changes the wizard's call pattern, the wizard test could be updated without touching the parser, and the parser would still be guarded. The small amount of duplication is the cost of an explicit, scoped executable contract.
- **[Risk] Adding a third ad-hoc script increases the surface area that future agents have to remember to run.** → Mitigation: the `AGENTS.md` edit is the single source of truth that names all three scripts; the `Parser test contract` Requirement in the `sql-import` spec reinforces that this script is the gate for parser changes.
- **[Risk] `AGENTS.md` is read by humans and other agents, so the edit should not bury the existing manual checklist.** → Mitigation: we keep the existing checklist intact and insert the test-script paragraph above it.
- **[Risk] The `sql-import` spec's `## Purpose` is still `TBD` after this change.** → Mitigation: that is the scope of a separate change (`fill-spec-purposes`) and is called out in the proposal's "Impact" section. Anyone reading the spec sees the `TBD` and knows it is intentional, not an oversight.

## Migration Plan

This is a low-risk, additive change. Steps:

1. Land the new test file `tests/sql-import.test.js` and run it to confirm it exits 0.
2. Apply the `AGENTS.md` edit.
3. Run the existing two test scripts to confirm no regression.
4. Run `openspec validate reconcile-testing-contract` and `openspec show reconcile-testing-contract`.
5. Archive the change with `openspec archive reconcile-testing-contract --yes`. This promotes the `sql-import` delta spec (the new `Parser test contract` Requirement) into `openspec/specs/sql-import/spec.md`.

Rollback, if needed before archiving, is `rm -rf openspec/changes/reconcile-testing-contract` and reverting the AGENTS.md / tests file changes. After archiving, the new Requirement is part of the `sql-import` spec history and can only be modified through a follow-up change.

## Open Questions

- _Should the new test file be added to a `package.json` `test` script so `npm test` runs all three?_ Out of scope for this change and explicitly non-goal here. The `bootstrap-initial-specs` design noted that `AGENTS.md` tells future agents to avoid tooling unless needed. A future change can revisit this if the team wants `npm test` to be the single entry point.
- _Should the existing two scripts be renamed or moved to a different directory to signal they are executable contracts?_ Out of scope; we are not touching them in this change.
- _Should the new test file also exercise `cleanIdentifier`, `splitSqlDefinitions`, etc. directly, or stay scenario-based and only call `parseSQLToTables`?_ Sticking with scenario-based is simpler, matches the existing scripts' style, and aligns with the spec's `WHEN`/`THEN` shape. The internal helpers are implementation details; locking them down by name would make future refactors harder.
