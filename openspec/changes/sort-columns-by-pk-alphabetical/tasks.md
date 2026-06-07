## 1. Implement column sorting in dbviewr.js

- [x] 1.1 Add a `sortColumns(columns)` helper function in `dbviewr.js` that:
  - Separates PK columns (`primary_key === true`) from non-PK columns
  - Sorts non-PK columns alphabetically by `name` (case-insensitive, stable)
  - Returns PK columns first (preserving original order), then sorted non-PK columns
- [x] 1.2 Update the table rendering function (likely `renderTable` or similar) to call `sortColumns` on the table's columns before rendering the column list
- [x] 1.3 Verify that the sort is applied only to the viewer's column list UI and does not mutate the original column array in the project data

## 2. Update tests

- [x] 2.1 Add a test scenario to `tests/dbviewr.test.js` that verifies:
  - A table with a PK column renders the PK first
  - Non-PK columns follow in alphabetical order
  - A table with no PK renders all columns alphabetically
- [x] 2.2 Run `node tests/dbviewr.test.js` and confirm all tests pass

## 3. Validate

- [ ] 3.1 Open `dbviewr.html` in the browser, load a project JSON, and visually confirm that columns are sorted PK-first + alphabetical
- [ ] 3.2 Test with a table that has a composite PK (multiple PK columns) and confirm they all appear first
- [ ] 3.3 Test with a table that has no PK and confirm alphabetical order

## 4. Archive

- [ ] 4.1 Run `/opsx-archive` to finalize the change
