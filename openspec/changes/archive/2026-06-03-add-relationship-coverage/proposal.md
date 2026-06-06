## Why

The `coverage-stats` capability currently tracks descriptions and reviewed status for tables and columns, but it does not surface anything about foreign-key (FK) relationships. As a result, a project can be 100% "described" and "reviewed" by the status bar while the analyst has not yet looked at the relationships at all. The `bootstrap-initial-specs` design recorded this as an open question and the follow-up housekeeping list (6.3) asked whether the next product change should add relationship coverage. The decision is to add it now: the status bar gets a new group that counts total FKs, FKs that already have a description (we will treat the relationship-level `constraint_name` and `local_columns` as identifying metadata and add a `description` field per parent relationship going forward), and a pending count for FKs that still need review.

## What Changes

- **Add** a new "Relationship coverage" group in the status bar, positioned after the existing "Pending" group, showing:
  - Total FKs (sum of `parents` across non-`REMOVED` tables; FKs are directional and we count each parent FK once).
  - FKs with description: `described / total`.
  - FKs reviewed: `reviewed / total` (described + `reviewed: true`).
- **Modify** the `coverage-stats` spec with a new Requirement "Relationship coverage counters" that locks in the above counts and the `#sb-total-fks`, `#sb-fk-desc`, `#sb-fk-rev` DOM IDs.
- **Modify** `app.js:766-826` (`computeStats` and `renderStatusBar`) to compute the new counters and update the new DOM elements.
- **Modify** `index.html` (status bar) to add the new `<div class="sb-group">` block for the FK counters.
- **Modify** the data model in `project-persistence` spec — but only by reference. Each parent relationship in the in-memory model gains an optional `description: string` and `reviewed: boolean` field. We do not change the JSON export shape, but we add the new fields to the `normalizeRelationships` backfill so older projects can carry them.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `coverage-stats`: Add a new Requirement `Relationship coverage counters` with scenarios for total FKs, described FKs, reviewed FKs, and the no-FK case.
- `project-persistence`: Add a new Requirement `Relationship metadata fields` to document that each parent relationship may carry `description: string` and `reviewed: boolean`, both defaulted to `""` and `false` on import, and preserved across the wizard's apply step.

## Impact

- `app.js`: edit `computeStats` (line 766) and `renderStatusBar` (line 789). No refactor of the existing logic; the new counters are appended to the returned object and to the status bar DOM update sequence.
- `index.html`: insert a new `<div class="sb-group">` block in the status bar, after the "Pendentes" group, with three `<span class="sb-value">` elements (`#sb-total-fks`, `#sb-fk-desc`, `#sb-fk-rev`).
- `style.css`: no edit. Reuse the existing `.sb-group`, `.sb-label`, `.sb-value` classes.
- `tests/sql-import.test.js`, `tests/update-model.test.js`, `tests/dbviewr.test.js`: no edit. The new test surface is `tests/coverage-stats.test.js`, added in this change.
- `openspec/specs/coverage-stats/spec.md`: one new Requirement added under the existing 5.
- `openspec/specs/project-persistence/spec.md`: one new Requirement added under the existing 4. This also affects the JSON round-trip but does not change the on-disk field names.
- `dbviewr.html`: not modified. The viewer does not currently display relationship metadata; that is its own future change.
- Backward compatibility: existing project JSONs that lack `description`/`reviewed` on relationships will have them backfilled to `""` and `false` by `normalizeRelationships` on import, matching the existing backfill pattern in `handleJSONUpload`.
- No build step, no new dependencies, no deployment impact.
