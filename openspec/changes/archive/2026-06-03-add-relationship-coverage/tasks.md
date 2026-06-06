## 1. Spec preparation

- [x] 1.1 Confirm `coverage-stats` delta spec adds `Relationship coverage counters` Requirement
- [x] 1.2 Confirm `project-persistence` delta spec adds `Relationship metadata fields` Requirement

## 2. App code changes

- [x] 2.1 Edit `app.js:766-787` (`computeStats`) to add `totalFks`, `fksDesc`, `fksRev` to the returned object
- [x] 2.2 Edit `app.js:789-826` (`renderStatusBar`) to write the three new counters to `#sb-total-fks`, `#sb-fk-desc`, `#sb-fk-rev`
- [x] 2.3 Edit `app.js:332-340` (`normalizeRelationship`) and `app.js:359-395` (`normalizeRelationships`) so that each parent relationship is normalized to include `description: string` (default `""`) and `reviewed: boolean` (default `false`)
- [x] 2.4 Add `computeStats` and `setProjectData` to `module.exports` in `app.js` so the test can exercise the function directly

## 3. Status bar HTML

- [x] 3.1 Insert a new `<div class="sb-group">` block in `index.html` status bar after the existing "Pendentes" group, containing `#sb-total-fks`, `#sb-fk-desc`, `#sb-fk-rev` with their labels
- [x] 3.2 Add `.sb-icon-violet` class to `style.css` for the FK icon (uses `var(--accent, #6d5dfc)` as fallback since `--violet` is not a design token)

## 4. Add coverage-stats test

- [x] 4.1 Create `tests/coverage-stats.test.js` with `node:assert/strict` style, covering: no FKs, all-undescribed FKs, mixed FKs, all-described-and-reviewed FKs, FKs on a `REMOVED` table not counted, whitespace-only description, normalize-relationship backfill
- [x] 4.2 Run the new test and confirm it exits 0

## 5. Regression and validate

- [x] 5.1 Run `node tests/sql-import.test.js` and confirm ok
- [x] 5.2 Run `node tests/update-model.test.js` and confirm ok (updated 3 `assert.deepEqual` blocks to include the new `description: ''` and `reviewed: false` fields per the new contract)
- [x] 5.3 Run `node tests/dbviewr.test.js` and confirm ok
- [x] 5.4 Run `node tests/coverage-stats.test.js` and confirm ok
- [x] 5.5 Run `openspec validate add-relationship-coverage` and resolve any errors
- [x] 5.6 Run `openspec show add-relationship-coverage` and skim

## 6. Archive

- [ ] 6.1 Run `openspec archive add-relationship-coverage --yes` to promote the new Requirements into `coverage-stats` and `project-persistence`
- [ ] 6.2 Run `openspec list --specs` and confirm both `coverage-stats` and `project-persistence` show one additional requirement
