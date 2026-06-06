## 1. Create the parser test file

- [x] 1.1 Create `tests/sql-import.test.js` using `node:assert/strict` and `require('../app.js')`, ending with `console.log('sql-import.test.js: ok')`
- [x] 1.2 Add scenario coverage: column extraction (name + type), inline primary key, inline foreign key, named FK constraint, quoted/schema-qualified identifiers, parenthesised types with commas, ALTER TABLE adding two FKs, ALTER TABLE on missing table being skipped, parent/child bidirectional normalization, duplicate deduplication
- [x] 1.3 Run `node tests/sql-import.test.js` and confirm it exits `0`

## 2. Update AGENTS.md

- [x] 2.1 Replace the sentence "No automated tests are currently configured" with a section that names the three test scripts (`tests/sql-import.test.js`, `tests/update-model.test.js`, `tests/dbviewr.test.js`) and maps each to its capability
- [x] 2.2 Keep the existing manual browser checklist intact
- [x] 2.3 Re-read `AGENTS.md` to confirm the change is local and the rest of the file is unchanged

## 3. Verify executable surface

- [x] 3.1 Run `node tests/sql-import.test.js` (new) and confirm `ok`
- [x] 3.2 Run `node tests/update-model.test.js` (regression) and confirm `ok`
- [x] 3.3 Run `node tests/dbviewr.test.js` (regression) and confirm `ok`

## 4. Validate and archive

- [x] 4.1 Run `openspec validate reconcile-testing-contract` and resolve any errors
- [x] 4.2 Run `openspec show reconcile-testing-contract` and skim the rendered output
- [ ] 4.3 Run `openspec archive reconcile-testing-contract --yes` to promote the new `Parser test contract` Requirement into `openspec/specs/sql-import/spec.md`
- [ ] 4.4 Run `openspec list --specs` and confirm `sql-import` now shows one additional requirement
