## Context

The DBMapper repository ships a read-only companion viewer that has, since its first cut, been named `dbviewr` everywhere it appears: source files, tests, the OpenSpec capability, the in-page brand, the browser tab title, the localStorage key, and every cross-reference in the docs and OpenSpec artifacts. The misspelling has become a cross-cutting fact of the project. This change replaces every occurrence of the misspelling with `dbviewer` so that the published `1.0` of the application ships under a correctly spelled name.

The repo is a zero-build static site: no `package.json`, no bundler, no framework, no test runner. The four viewer files live at the repo root, the executable contract lives at `tests/dbviewr.test.js`, and the OpenSpec capability lives at `openspec/specs/dbviewr/spec.md`. Two adjacent specs (`static-site-security`, `project-persistence`) reference the viewer by name and filename in prose, so they have to be updated in lockstep.

## Goals / Non-Goals

**Goals:**

- Make the viewer name `dbviewer` everywhere it appears: file paths, in-page strings, the localStorage key, the test name, the OpenSpec capability folder, the docs, and the cross-references in adjacent specs.
- Preserve the behavioral contract: search, theme toggle, `REMOVED` filter, relationships panel, PK-first column sort, anchor links, and the static-site security guarantees (CSP, no inline script/style, external `dbviewer.js` and `dbviewer.css`).
- Keep the change reviewable: `git mv` for the four source files, the test, and the spec folder so history is preserved as renames.
- Land the change on `main` and push to `origin` so the published `1.0` carries the corrected name.

**Non-Goals:**

- Migrating the old `dbviewr-theme` localStorage value to `dbviewer-theme`. This is a typo fix at `1.0`; a one-time theme reset is acceptable.
- Renaming `DBMapper` itself or the editor (`dbmapper.html`, `app.js`, `style.css`).
- Introducing redirects, aliases, or backwards-compatibility shims. The misspelling is dropped outright.
- Touching `app.js` — the editor never references the viewer by filename.
- Adopting any tooling, bundler, or test framework.

## Decisions

- **Use `git mv` for the four source files, the test, and the spec folder.** This keeps `git log --follow` working and shows the changes as `R` in `git status`. A delete + add would lose the rename detection and produce a noisier diff.
- **Drop the `dbviewr-theme` localStorage key without a migration shim.** The user-facing impact is a one-time theme reset, and the simplification (no fallback read, no cleanup write) keeps `applyTheme` identical in shape to the current implementation. The proposal marks this explicitly as a non-goal so it is reviewable.
- **Rename the OpenSpec capability folder (`openspec/specs/dbviewr/` → `openspec/specs/dbviewer/`) and update the spec body in place.** The spec's requirements are unchanged in intent; only the filenames, the localStorage key, the title string, and the brand string change. The delta spec in this change folder uses an `ADDED Requirements` housekeeping block to record the rename, so the OpenSpec archive step has a visible delta to apply.
- **Treat the cross-references in `static-site-security` and `project-persistence` as housekeeping deltas.** Each gets an `ADDED Requirements` block describing the rename, again so the archive step has a delta to apply. The behavioral requirements in those specs are not changing.
- **Update the existing change folders under `openspec/changes/` (including `archive/`) in place.** Their prose references the viewer by its old name; leaving the misspelling in the historical record would leak the typo into every future `openspec list` and search.
- **Keep the executable contract structurally identical, only swap filenames and the localStorage key.** The contract continues to assert the same DOM scaffolding, the same helpers, the same `REMOVED` filter, and the same `body.theme-dark` hook. Only the file paths, the title pattern, and the localStorage key change.
- **Do not introduce a redirect from `dbviewr.html` to `dbviewer.html`.** The repo is a static site with no server-side layer; the only "redirect" that would help is an HTML file at the old path, which would re-introduce the misspelling as a shipping artifact. Skipping it is the cleaner choice at `1.0`.

## Risks / Trade-offs

- [Risk] Users who previously opened the viewer lose their theme preference. → Mitigation: documented in the proposal as an explicit non-goal. The impact is bounded to the viewer (not the editor) and resets to the light theme.
- [Risk] A stale link to `dbviewr.html` in someone's README, slide deck, or internal wiki breaks. → Mitigation: the project README, AGENTS.md, CONTRIBUTING.md, and SECURITY.md are all updated in this change, so the canonical references on GitHub point at the new name.
- [Risk] The OpenSpec archive step rejects a rename that removes the `dbviewr` spec folder without an explicit deletion in the delta. → Mitigation: the proposal and design both call out the rename; if the archive step surfaces a `MISSING` or `CONFLICT` warning, the fallback is a one-line `REMOVED Requirements` block in the delta that names the old capability.
- [Risk] The localStorage key change could be interpreted as a behavior change by the executable contract. → Mitigation: the contract is updated to assert the new key (`dbviewer-theme`) and the assertion stays a positive presence check, not a migration check.
- [Risk] A missed reference in `openspec/changes/archive/*` keeps the misspelling in the historical record. → Mitigation: the implementation step does a repo-wide `rg` for `dbviewr` and `DBViewr` before committing; any hit is either updated or justified as a deliberate historical reference.

## Migration Plan

This is a documentation, filename, and string-only change. There is no data migration, no schema migration, and no server-side rollout.

1. Apply the change locally:
   - `git mv dbviewr.html dbviewer.html`, `git mv dbviewr.js dbviewer.js`, `git mv dbviewr.css dbviewer.css`, `git mv tests/dbviewr.test.js tests/dbviewer.test.js`, `git mv openspec/specs/dbviewr openspec/specs/dbviewer`.
   - Edit `dbviewer.html` (title, brand, `<link>`, `<script>`), `dbviewer.js` (localStorage key), `tests/dbviewer.test.js` (filenames, title, localStorage key), `openspec/specs/dbviewer/spec.md` (filenames, title, brand, localStorage key), `openspec/config.yaml`, `openspec/specs/static-site-security/spec.md`, `openspec/specs/project-persistence/spec.md`, `openspec/changes/*` (in-flight and archived), `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES`, `.gitignore`.
2. Run the executable contract: `node tests/dbviewer.test.js`. All assertions pass.
3. Manually load `dbviewer.html` in the browser; the title shows `DBViewer - Dicionário de Dados`, the brand shows `DBViewer`, the dark-mode toggle persists across reloads (under the new key).
4. `git add -A`, commit with an imperative message, and `git push origin main`.
5. Rollback is `git revert <commit>` followed by `git push origin main`; no data or schema is involved.
