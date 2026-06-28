## Context

DBMapper is a static, single-page web application (no bundler, no framework, no build step) that helps a user enrich a relational schema with semantic metadata. The runtime is a small set of files at the repository root:

- `index.html` — UI shell, loads `app.js` and the Materialize + AlaSQL CDN scripts.
- `app.js` — global state, SQL parsing, rendering, persistence, and update wizard (1964 lines).
- `style.css` — full design system.
- `dbviewer.html` — separate self-contained page (1463 lines) that consumes the same project JSON in read-only mode.
- `tests/*.test.js` — two ad-hoc Node `assert` scripts (the wizard and DBViewer contracts).

The OpenSpec repository is initialised (`openspec/config.yaml`, schema `spec-driven`) but `openspec/specs/` is empty and no change has been proposed yet. The team now wants to adopt spec-driven development going forward, which means we need a baseline set of specs that document the behavior the app already ships.

The seven capabilities proposed (`sql-import`, `project-persistence`, `schema-tree`, `semantic-editor`, `coverage-stats`, `model-update-wizard`, `dbviewer`) are not arbitrary — they correspond to the seven coherent user-facing and contract surfaces that already exist in the code. The decomposition was chosen so that each spec has stable, independently testable requirements and so that future changes can be scoped to one capability at a time.

## Goals / Non-Goals

**Goals:**

- Produce seven delta specs whose requirements can be satisfied by code that already exists in `app.js` and `dbviewer.html`. Every requirement must be traceable to a concrete code site (line ranges are referenced from each spec).
- Keep the spec wording behavior-oriented (the `WHEN`/`THEN` scenarios describe user-observable outcomes), not implementation-oriented (no mention of internal helpers or DOM IDs beyond what is needed for traceability).
- Make the JSON project contract (`project-persistence`) the single source of truth shared by DBMapper and DBViewer, and have both editor and viewer capabilities reference it.
- Preserve the existing test scripts (`tests/update-model.test.js`, `tests/dbviewer.test.js`) as the executable surface that the wizard and viewer specs depend on, without forcing a migration to a test framework.
- Keep the OpenSpec adoption minimal: a single change, no source code edits, no AGENTS.md edits, no config.yaml edits in this PR.

**Non-Goals:**

- Refactoring or splitting `app.js` into modules.
- Adding a test framework or converting the ad-hoc Node tests to a runner.
- Introducing a build system, bundler, type system, or framework.
- Modifying the UI design, the design system tokens, or the visual reference (`novo-layout.png`).
- Documenting internal helpers (`escapeHtml`, `makeTreeItem`, `cleanIdentifier`, etc.) at the requirement level — they are implementation details of the capabilities above.

## Decisions

- **Seven capabilities, not fewer and not more.** Combining, for example, `schema-tree` and `semantic-editor` would mix navigation and editing concerns and produce a spec too large to reason about; splitting further (e.g. one spec per badge type) would create specs with trivial requirements. The chosen split mirrors the natural seams in the code: parsing (sql-import), data model (project-persistence), read-side UI (schema-tree), write-side UI (semantic-editor), metrics (coverage-stats), schema evolution (model-update-wizard), external read-only consumer (dbviewer).
- **`project-persistence` is the cross-cutting capability.** Both DBMapper and DBViewer depend on the exact same JSON shape. Documenting it as its own spec — with the export/import round-trip and the legacy backfill — keeps the two UI specs from duplicating the data model and makes the contract explicit for any future consumer (CLI, server, BI tool).
- **Specs reference code sites, not the other way around.** Requirements stay behavior-oriented, but each requirement mentions the relevant function or DOM target so a reviewer can map a `WHEN`/`THEN` to existing code in seconds. This avoids the trap of "specs as architecture diagrams" and keeps the spec layer honest about what the code actually does today.
- **No new requirements are added.** Because this is a backfill change, every requirement must already be implemented. If we discover a gap while writing the specs, we stop and either fix the spec wording or open a follow-up change — we do not silently inflate the contract. This protects the team's ability to ship small, reviewable changes later.
- **The two ad-hoc Node tests stay as-is.** They run with `node tests/foo.js` and are referenced by name in the relevant specs. We do not turn them into a `package.json` test script in this change because `AGENTS.md` explicitly tells future agents to avoid adding tooling unless needed. The tests are the executable surface, and the specs name them.
- **The wizard spec covers the model, not the modal.** The modal markup (`update-modal`, `update-dialog-*`) is implementation. The spec talks about the user-visible steps (`upload`, `tables`, `columns`, `relationships`, `summary`) and the actions the user can take on each row, which is what the requirements need to lock down.
- **DBViewer is a separate capability even though it shares the project format.** The viewer has its own requirements (search, theme persistence, `REMOVED` filtering, anchor links) and its own test file. Documenting it separately makes it easy to evolve the viewer without touching editor specs and vice versa.

## Risks / Trade-offs

- **[Risk] Specs drift from code as the app evolves.** → Mitigation: every requirement cites a code site; future change proposals must update the spec, and reviewers can spot drift in PRs.
- **[Risk] The seven-capability split may turn out to be wrong as the app grows.** → Mitigation: capabilities are cheap to merge or split later — the OpenSpec archive step promotes each `specs/<capability>/spec.md` independently, and a follow-up change can introduce a new capability or move requirements between them.
- **[Risk] The `AGENTS.md` statement "no automated tests" conflicts with the two test files.** → Mitigation: this change does not edit AGENTS.md; the conflict is documented as an observation, and reconciling it is left to a future change.
- **[Risk] DBViewer's read-only behavior could regress silently because the wizard test script and the viewer test script are independent.** → Mitigation: the `dbviewer` spec names `tests/dbviewer.test.js` as the executable contract and the `model-update-wizard` spec names `tests/update-model.test.js`. Each test file stays the single executable gate for its capability.
- **[Risk] No automated test for `sql-import` aside from the wizard tests that exercise the parser.** → Mitigation: the `sql-import` spec does not require a dedicated test file; it leans on the parser being exercised by the wizard. If parser regressions become a concern, a follow-up change can add a focused test file without touching this spec.

## Migration Plan

This change is documentation-only. There is no runtime migration. The "promotion" of the seven delta specs to `openspec/specs/` happens once when the change is archived (typically after implementation is marked complete and reviewed):

1. Merge this PR with `proposal.md`, `design.md`, `tasks.md`, and `openspec/changes/bootstrap-initial-specs/specs/<capability>/spec.md` (7 files).
2. Verify locally with `openspec validate bootstrap-initial-specs`.
3. Archive the change with `openspec archive bootstrap-initial-specs --yes`. This creates `openspec/specs/<capability>/spec.md` for each of the seven capabilities and removes the change directory.
4. Subsequent changes use the standard `openspec new change <name>` flow against the now-populated `openspec/specs/`.

Rollback, if needed before archiving, is just `rm -rf openspec/changes/bootstrap-initial-specs`. After archiving, the new specs are part of the spec history and can only be modified through a follow-up change.

## Open Questions

- _Should we reconcile the `AGENTS.md` "no automated tests" sentence with the two existing `tests/*.test.js` files?_ Out of scope for this change, but worth a follow-up.
- _Should `coverage-stats` also count relationship coverage in the future?_ Currently the status bar only tracks descriptions and review status; relationships are not counted. Adding that is a product decision, not a spec gap to fix here.
- _Should the wizard's column rename step also cover type changes (`int` → `serial`)?_ Today it surfaces type changes as `CHANGED` rows with a single "Atualizar tipo" action, not as renames. The spec reflects that. If a future change wants to merge type change and rename, it can modify the `model-update-wizard` requirements.
