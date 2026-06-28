## 1. Validate proposal and design

- [x] 1.1 Read `proposal.md` and confirm the seven capabilities and the "no code changes" decision match the team's understanding
- [x] 1.2 Read `design.md` and confirm the decomposition rationale, the cross-cutting `project-persistence` decision, and the open questions are accepted

## 2. Review the seven spec files

- [x] 2.1 Read `specs/sql-import/spec.md` and confirm every requirement matches the behavior of `parseSQLToTables`, `parseAlterTableForeignKeys`, and `normalizeRelationships` in `app.js`
- [x] 2.2 Read `specs/project-persistence/spec.md` and confirm the data model, export, import, and backfill requirements match `app.js` and the JSON shape consumed by `dbviewer.html`
- [x] 2.3 Read `specs/schema-tree/spec.md` and confirm badge classes, status values, and collapse behavior match `renderTreeView` and friends in `app.js`
- [x] 2.4 Read `specs/semantic-editor/spec.md` and confirm the editor, chips, review toggle, and relationships panel requirements match `app.js`
- [x] 2.5 Read `specs/coverage-stats/spec.md` and confirm the totals, described/reviewed counters, pending, and color thresholds match `computeStats` and `renderStatusBar`
- [x] 2.6 Read `specs/model-update-wizard/spec.md` and confirm every step, action, and preservation rule matches the wizard in `app.js` and the assertions in `tests/update-model.test.js`
- [x] 2.7 Read `specs/dbviewer/spec.md` and confirm every requirement matches the DOM contracts and the `REMOVED`/search/relationships/theme rules exercised by `tests/dbviewer.test.js`

## 3. Verify executable surface still passes

- [x] 3.1 Run `node tests/update-model.test.js` and confirm it exits 0 — this validates `model-update-wizard` and parts of `sql-import`
- [x] 3.2 Run `node tests/dbviewer.test.js` and confirm it exits 0 — this validates `dbviewer`
- [x] 3.3 Open `index.html` in a browser via `python3 -m http.server 8000` and confirm the editor still loads, import/save/open still work, and the wizard opens on a loaded project

## 4. Validate the change with the OpenSpec CLI

- [x] 4.1 Run `openspec validate bootstrap-initial-specs` from the repository root and resolve any reported errors
- [x] 4.2 Run `openspec show bootstrap-initial-specs` and skim the rendered output to make sure all eight artifacts are listed and correctly cross-linked

## 5. Archive the change

- [ ] 5.1 After review approval, run `openspec archive bootstrap-initial-specs --yes` to promote the seven delta specs to `openspec/specs/<capability>/spec.md`
- [ ] 5.2 Run `openspec list --specs` and confirm seven capabilities are listed: `sql-import`, `project-persistence`, `schema-tree`, `semantic-editor`, `coverage-stats`, `model-update-wizard`, `dbviewer`
- [ ] 5.3 Confirm the directory `openspec/changes/bootstrap-initial-specs/` is removed (or only contains archive metadata) and `openspec/specs/` now contains the seven new folders

## 6. Follow-up housekeeping (out of scope for this change, track separately)

- [ ] 6.1 Open a follow-up change to reconcile the `AGENTS.md` statement "no automated tests" with the two existing `tests/*.test.js` files
- [ ] 6.2 Decide whether to add a dedicated parser test file (referenced from `sql-import`) or keep relying on the wizard tests for parser coverage
- [ ] 6.3 Decide whether the next product change should add relationship coverage to `coverage-stats`
