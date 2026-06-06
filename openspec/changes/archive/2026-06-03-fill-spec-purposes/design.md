## Context

`## Purpose` is the first prose section a reader sees when opening a spec. The OpenSpec template inserts a `TBD - created by archiving change <name>. Update Purpose after archive.` line as a placeholder so the team fills it in later. The seven specs in `openspec/specs/` (one per capability archived by `bootstrap-initial-specs`) all still carry that placeholder. This change is a focused hygiene pass: write a 1–3 sentence `## Purpose` paragraph for each spec, behavior-oriented, that names the capability's user-facing responsibility and points to the executable test script where one exists.

This change is intentionally not a feature change. It does not introduce, modify, or remove any requirement. The only artifact is the `proposal.md` (this design is short for the same reason), the `tasks.md` checklist, and the seven file edits. After archiving, the seven `## Purpose` paragraphs are part of the spec history; a future change can reword them through a new follow-up change.

## Goals / Non-Goals

**Goals:**

- Replace the `TBD` line in each of the 7 specs with a behavior-oriented 1–3 sentence paragraph.
- Use a consistent tone across the 7 paragraphs (one short opening sentence stating what the capability is, optionally a second sentence pointing to the executable test script or to the cross-cutting `project-persistence` contract).
- No requirement is added, removed, or modified.

**Non-Goals:**

- Rewriting or restructuring the `## Requirements` sections.
- Adding new capabilities or modifying existing ones.
- Editing `AGENTS.md`, `openspec/config.yaml`, or any source file.
- Resolving the `bootstrap-initial-specs` open questions (relationship coverage, AGENTS.md/test reconciliation). Those are tracked in their own follow-up changes; the `fill-spec-purposes` for `coverage-stats` will describe the capability as it is today (which already includes the relationship coverage added by `add-relationship-coverage`).

## Decisions

- **Tone and length: one to three sentences per paragraph.** Long enough to convey what the capability is and where its executable surface lives; short enough to skim. We avoid implementation details and we avoid marketing language.
- **Reference the executable test where one exists.** `sql-import`, `model-update-wizard`, `dbviewr`, and `coverage-stats` all have a `tests/*.test.js` script. We name the script in the Purpose paragraph so a reader knows where to look for the executable contract without having to read every requirement.
- **Reference `project-persistence` from the UI specs.** `schema-tree`, `semantic-editor`, `coverage-stats`, `model-update-wizard`, and `dbviewr` all read or write the JSON project format. We mention `project-persistence` in those Purpose paragraphs so the cross-cutting contract is visible.
- **No `## MODIFIED Requirements` block.** We are not changing requirements. The change has no delta specs. The `specs/` directory of this change is empty; the only spec edits are direct file edits in `openspec/specs/`, which OpenSpec allows for non-spec changes.

## Risks / Trade-offs

- **[Risk] The 7 paragraphs drift in style over time as future changes edit them.** → Mitigation: this is a single authoring pass with a consistent template; subsequent changes that touch a Purpose paragraph will be reviewable individually.
- **[Risk] A reader skims the Purpose paragraph and assumes it is the full contract.** → Mitigation: every Purpose paragraph explicitly says "see the requirements below" or similar phrasing that points the reader down to the `## Requirements` section.
- **[Risk] Mentioning a test file that gets renamed or removed in the future makes the Purpose paragraph stale.** → Mitigation: this is a small, low-cost inconsistency; a follow-up change can update the paragraph. We accept the risk to keep the Purpose paragraph useful as a navigation aid.

## Migration Plan

This is a documentation-only change. Steps:

1. Edit each of the 7 spec files in `openspec/specs/` to replace the `TBD` line.
2. `openspec validate fill-spec-purposes` (which is a no-op for changes without delta specs but confirms the change is well-formed).
3. `openspec archive fill-spec-purposes --yes` to mark the change as complete. The 7 `## Purpose` paragraphs are not part of any delta spec, so the archive step does not modify any spec — it just records the housekeeping done.

Rollback, if needed, is `rm -rf openspec/changes/fill-spec-purposes` and reverting the 7 file edits.

## Open Questions

- _Should the `## Purpose` paragraph reference the AGENTS.md "Testing Guidelines" section instead of naming each test script directly?_ Naming the test file is more direct and survives a future AGENTS.md rewrite. We chose the direct reference.
- _Should the Purpose paragraph for `dbviewr` mention that it is the read-only counterpart of the editor, even though `dbviewr` is its own capability in the spec layer?_ The two are separate capabilities in OpenSpec because they have different requirements, but they share the project format. The Purpose paragraph will name the project-format dependency without claiming the two are "the same capability".
