## 1. Edit the 7 spec Purpose paragraphs

- [x] 1.1 Edit `openspec/specs/sql-import/spec.md` Purpose — describe the SQL ingestion + normalization responsibility and point to `tests/sql-import.test.js`
- [x] 1.2 Edit `openspec/specs/project-persistence/spec.md` Purpose — describe the JSON contract shared by editor and viewer, with backfill on import
- [x] 1.3 Edit `openspec/specs/schema-tree/spec.md` Purpose — describe the sidebar tree and the change/semantic badges, and reference the `project-persistence` JSON shape
- [x] 1.4 Edit `openspec/specs/semantic-editor/spec.md` Purpose — describe the per-item editor (description, terms, review, relationships) and reference `project-persistence`
- [x] 1.5 Edit `openspec/specs/coverage-stats/spec.md` Purpose — describe the status bar metrics (totals, described, reviewed, FK coverage, pending, progress) and point to `tests/coverage-stats.test.js`
- [x] 1.6 Edit `openspec/specs/model-update-wizard/spec.md` Purpose — describe the 5-step diff wizard and point to `tests/update-model.test.js`
- [x] 1.7 Edit `openspec/specs/dbviewr/spec.md` Purpose — describe the read-only data dictionary, the `REMOVED` filter, the theme toggle, and point to `tests/dbviewr.test.js`

## 2. Validate and archive

- [x] 2.1 Run `openspec validate fill-spec-purposes`
- [x] 2.2 Run `openspec show fill-spec-purposes` and skim
- [ ] 2.3 Run `openspec archive fill-spec-purposes --yes` to record the housekeeping
- [ ] 2.4 Open each of the 7 spec files in `openspec/specs/` and visually confirm the new `## Purpose` paragraph reads cleanly and the `## Requirements` section is untouched
