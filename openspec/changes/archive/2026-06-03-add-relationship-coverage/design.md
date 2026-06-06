## Context

The status bar (`#status-bar` in `index.html`, rendered by `app.js:766-826`) is the at-a-glance health panel of a DBMapper project. It currently shows: identity, totals, described coverage, reviewed coverage, pending, and overall progress. The "Pendentes" count is `(totalTables - revTables) + (totalCols - revCols)`, which only counts descriptions/reviews. Foreign-key relationships are entirely absent from the panel even though the parser already populates `table.relationships.parents` for every FK. A project can be 100% complete by the existing metrics and still have an unwritten description for the relationship `pedido.cliente_id → cliente.id`.

The decision recorded in the conversation is to add FK coverage now. The two natural questions for any new metric are (1) what is an "FK" in this model and (2) what does it mean for one to be "described" and "reviewed". The model is: each parent relationship is a record `{ table, local_columns, referenced_columns, constraint_name }` on a non-`REMOVED` table. The new fields we add to that record are `description: string` and `reviewed: boolean`, both defaulted to `""` and `false` on import, mirroring the per-item model. A "described FK" has a non-whitespace `description`; a "reviewed FK" is described AND `reviewed: true`. We do not ask the user to enter these fields yet — that is a separate future change for the relationships panel in `semantic-editor` — but the spec change here makes the data model and the status bar agree so that when that editor change lands, the metrics just work.

This change does not touch `dbviewr.html`; the viewer does not currently display relationship metadata and we are not extending it here. The metrics live in the editor's status bar.

## Goals / Non-Goals

**Goals:**

- Add a "FKs" group to the status bar with three counters: total, described (`described/total`), reviewed (`reviewed/total`), separated from the existing "Pendentes" group.
- Extend each parent relationship with `description: string` (default `""`) and `reviewed: boolean` (default `false`), with backfill in `normalizeRelationships` so older JSON projects are handled cleanly.
- Update the `coverage-stats` spec with a new Requirement that documents the counters, the DOM IDs, and the rules for counting (REMOVED tables excluded, each parent counted once).
- Update the `project-persistence` spec with a new Requirement that documents the optional `description`/`reviewed` fields on each parent relationship, with the same backfill behavior as existing per-item fields.
- Add `tests/coverage-stats.test.js` that asserts the new counters for a fixed project shape (no FKs, only-undescribed FKs, mixed FKs, all-described-and-reviewed FKs, FKs on `REMOVED` tables not counted).
- Keep the change minimal: no refactor of `computeStats`, no DOM refactor, no styling changes.

**Non-Goals:**

- Adding a relationship-description editor UI in `semantic-editor`. The fields exist in the data model and the status bar reads them, but the user has no way to fill them in yet. That is a deliberate, planned follow-up.
- Changing `dbviewr.html` to display FK descriptions. The viewer is read-only and does not yet show this metadata; we are not extending it here.
- Changing how `dbviewr` filters `REMOVED` tables; the existing `table.status !== 'REMOVED'` rule is reused.
- Refactoring `computeStats` or `renderStatusBar`. We append to the returned object and to the DOM update sequence.

## Decisions

- **FK count = number of `parents` across non-`REMOVED` tables.** A parent relationship is one edge in the FK graph and is the unit the parser already produces. We do not deduplicate across both sides; the parent side is the canonical record. Children are derived from parents by `normalizeRelationships` and we ignore the children list to avoid double-counting.
- **`description` and `reviewed` on relationships are optional, defaulted to `""` and `false`.** This mirrors the existing per-item model and lets older JSON exports keep working. `normalizeRelationships` is the single place that defaults these fields, and `handleJSONUpload` already calls it, so the backfill happens at import time.
- **The new status bar group sits between "Pendentes" and the progress group.** The status bar flows from identity → totals → described → reviewed → pending → **FKs** → progress. This keeps descriptions and reviews (per item) as the primary metrics and adds FKs as a secondary panel.
- **New DOM IDs: `#sb-total-fks`, `#sb-fk-desc`, `#sb-fk-rev`.** These names follow the existing `#sb-<group>-<counter>` pattern (`#sb-total-tables`, `#sb-desc-tables`, `#sb-rev-tables`, etc.). Reuse existing CSS classes — no new style work.
- **The "Pendentes" counter does NOT include FKs in this change.** The new FK group has its own described/reviewed counters; the existing "Pendentes" stays as `tables + columns`. Adding FKs into "Pendentes" would silently change its meaning for every existing user; the new group makes the addition explicit. A follow-up could fold FKs into the overall progress percentage.
- **No `progress percentage` change.** The progress bar still counts `tables + columns` reviewed. FKs do not contribute to the percentage yet; that is also a follow-up.
- **Spec change is `ADDED Requirements` in both `coverage-stats` and `project-persistence`.** We are not changing any existing Requirement's text or scenarios in either spec, so we use `ADDED` for the new ones and avoid the brittle "MODIFIED must include the full updated content" path. This matches the choice made in `reconcile-testing-contract` and keeps the change reviewable.

## Risks / Trade-offs

- **[Risk] The "Pendentes" counter and the progress percentage no longer reflect the full picture (FKs are unaccounted for).** → Mitigation: the new FK group is right next to "Pendentes" and the visual gap is small. A follow-up change can fold FKs into both. We are explicit about this in the proposal.
- **[Risk] Older JSON exports round-trip cleanly because `normalizeRelationships` backfills the new fields, but a project that already has the fields in some other shape (e.g. `null`) could fail the strict assert in the new test.** → Mitigation: the test uses fixed fixtures; the backfill code uses `||` defaults, so `null` falls through to `""`/`false`. We document this in the spec.
- **[Risk] Adding a `description` and `reviewed` to every parent relationship increases the JSON size for large projects.** → Mitigation: both are short strings/booleans; the size impact is negligible. We are not adding deep objects.
- **[Risk] Future relationship-description editor work in `semantic-editor` will have to handle a missing description field gracefully (older projects in flight when the editor lands).** → Mitigation: the backfill default is `""`, which the editor's `persistEditorFields` already handles. We mention this in the design's "Open Questions" as a follow-up trigger.
- **[Risk] Spec delta format: `ADDED` rather than `MODIFIED` may surprise reviewers expecting the full updated content for changed files.** → Mitigation: we explicitly call this out in the proposal and design. No existing Requirement in `coverage-stats` or `project-persistence` is being changed, only added to.

## Migration Plan

Low-risk, additive change. Steps:

1. Land the `coverage-stats` and `project-persistence` delta specs first (just files in `openspec/changes/add-relationship-coverage/specs/`).
2. Edit `app.js`: add `totalFks`, `fksDesc`, `fksRev` to the `computeStats` return object; add three `set(...)` calls in `renderStatusBar`; add `description: ""` and `reviewed: false` defaults in `normalizeRelationships` for each parent relationship.
3. Edit `index.html` to add the new status bar group.
4. Add `tests/coverage-stats.test.js` and run it.
5. Run all three existing test scripts as a regression check.
6. `openspec validate add-relationship-coverage` and `openspec show add-relationship-coverage`.
7. `openspec archive add-relationship-coverage --yes`.

Rollback, if needed before archiving, is `rm -rf openspec/changes/add-relationship-coverage` and reverting the `app.js`/`index.html` edits. After archiving, the new Requirements and DOM IDs are part of the spec history and can only be modified through a follow-up change.

## Open Questions

- _Should the relationship-description editor land in the same change, or in a follow-up?_
- _Should the overall progress percentage eventually include FKs? If so, the "Pendentes" counter and the percentage definition both need a MODIFIED Requirement in a follow-up change._
- _Should `dbviewr` also display FK descriptions? That is a `dbviewr` spec change and out of scope here._
- _Should the new status bar group also count children relationships? We currently ignore them to avoid double-counting; if the team wants a single "edges" metric, that is a small follow-up._
