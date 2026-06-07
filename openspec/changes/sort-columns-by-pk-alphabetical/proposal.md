## Why

When reading a data dictionary in DBViewr, users often need to locate a specific column within a table. Currently, columns appear in the order they were defined in the original SQL, which is unpredictable and makes scanning difficult. Sorting columns with the primary key first, followed by the rest in alphabetical order, creates a consistent, scannable layout that dramatically improves readability.

## What Changes

- Columns in each table's column list will be reordered: the primary key column (if present) appears first, followed by all other columns sorted alphabetically by name.
- The reordering applies to the viewer surface only (`dbviewr.html` / `dbviewr.js`). The editor (`dbmapper.html`) preserves the original SQL order, since that reflects the schema definition.
- No changes to the JSON project format or the editor's behavior.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `dbviewr`: The column rendering order changes from SQL-definition order to PK-first + alphabetical. This is a spec-level behavior change because the rendered output order is part of the viewer's contract.

## Impact

- **Code**: `dbviewr.js` — the function that renders a table's column list needs to sort columns before rendering.
- **Tests**: `tests/dbviewr.test.js` — may need updates if it asserts column order.
- **Dependencies**: None. This is a pure UI-layer change.

## Non-goals

- No changes to the editor (`dbmapper.html`) column order.
- No changes to the JSON project format.
- No new capabilities or features beyond column sorting in the viewer.
