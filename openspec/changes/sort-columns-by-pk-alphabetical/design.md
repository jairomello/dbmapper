## Context

DBViewr is the read-only companion site that renders a project JSON as a navigable data dictionary. Columns are currently rendered in the order they appear in the JSON (which reflects the original SQL definition order). This makes it hard for readers to scan for a specific column, especially in wide tables.

The change is scoped to `dbviewr.js` only. The editor (`dbmapper.html` / `app.js`) preserves SQL order because that reflects the schema definition and is useful during authoring.

## Goals / Non-Goals

**Goals:**
- Make column lists in DBViewr scannable by placing the primary key column first, followed by all other columns in alphabetical order.
- Keep the change minimal and localized to the viewer's rendering logic.

**Non-Goals:**
- No changes to the editor's column order.
- No changes to the JSON project format.
- No new UI controls or user preferences for sort order.

## Decisions

**Decision: Sort at render time, not at data load time**

The column sorting will happen inside the function that renders a table's column list, not in `normalizeProject` or any data-loading step. This keeps the raw data intact and makes the sorting a pure presentation concern.

Rationale: If we sorted during data normalization, the sort order would leak into other parts of the system (e.g., search results, stats). Keeping it at render time ensures the sort is only applied to the column list UI.

**Decision: Primary key detection uses `column.primary_key === true`**

The PK column is identified by the `primary_key` boolean flag that already exists on each column object in the project JSON. If multiple columns are marked as PK (composite key), all PK columns appear first (in their original relative order), followed by the alphabetically sorted non-PK columns.

Rationale: This matches the existing data model and avoids introducing new heuristics.

**Decision: Stable sort for non-PK columns**

Non-PK columns are sorted alphabetically by `column.name` using a case-insensitive comparison. The sort is stable so that columns with the same name (unlikely but possible) preserve their original order.

## Risks / Trade-offs

- **Risk**: If a table has no PK column, all columns are sorted alphabetically. This is acceptable and consistent with the goal of scannability.
- **Risk**: Composite PKs with multiple columns will all appear first, which may push some non-PK columns further down. Mitigation: this is the expected behavior for composite keys.

## Migration Plan

No migration needed. This is a pure UI-layer change that takes effect immediately when the viewer is loaded. No data format changes, no config changes, no rollback strategy required.
