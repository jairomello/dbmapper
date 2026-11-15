## Context

OpenSpec's `config.yaml` accepts three optional top-level blocks: `context:` (free-form project background shown to the AI when creating artifacts), `rules:` (per-artifact rules), and `schema:` (already set to `spec-driven`). Today the file contains only the schema declaration, which means every time an agent asks the CLI for instructions on a new artifact, the CLI passes an empty `context` to the model. The model then has to re-read `AGENTS.md`, `README.md` (none here), and several source files just to understand the project. That is wasted work and a risk factor: a hurried agent may skip steps or invent conventions that the project does not follow.

The two earlier housekeeping changes (`reconcile-testing-contract` and `add-relationship-coverage`) both made the test scripts and the spec delta structure explicit at the application level. They did not, however, make the OpenSpec layer aware of those decisions. This change closes that gap at the OpenSpec layer.

## Goals / Non-Goals

**Goals:**

- Populate `context:` with 5–8 lines describing the project (static site, no bundler, Portuguese UI, ad-hoc Node tests, 7 capabilities, JSON project format shared with DBViewer).
- Populate `rules:` with a small set of per-artifact rules: short proposals, `WHEN`/`THEN` scenarios, `- [ ]` checkbox tasks, design docs only when cross-cutting, and the static-site guardrail from `AGENTS.md`.
- Keep the change reviewable: the new content is a small additive edit, not a structural rewrite.
- No spec is added or modified. The change has no delta specs.

**Non-Goals:**

- Restructuring `config.yaml` (e.g. moving blocks, adding a profile system).
- Adding per-capability config (we keep one global config).
- Migrating to a `package.json` test script or any other tooling change. The static-site rule and the ad-hoc Node test rule are documented in `context` for the agent's benefit; we are not making the tooling itself stricter.
- Editing `AGENTS.md` to reference `config.yaml`. The two files coexist; the team can deduplicate in a future change.

## Decisions

- **One global `context:` block, no per-capability overrides.** OpenSpec config is project-wide. If a future capability needs special framing, the team can add it inline in a proposal instead of restructuring the config.
- **The `context:` paragraph is short (5–8 lines) and behavior-oriented.** It names the stack, the language, the test style, and the cross-cutting JSON contract. It does not restate `AGENTS.md` line by line.
- **The `rules:` block targets the four artifacts used by `spec-driven` (`proposal`, `design`, `specs`, `tasks`).** Each rule is one or two lines, phrased as a constraint on the AI's output, matching the OpenSpec convention.
- **Static-site guardrail is duplicated from `AGENTS.md` into `rules.tasks`** (or `rules.proposal`, whichever is more natural). We are explicit that this is duplication and that `AGENTS.md` is still authoritative for humans; the `rules` block is for the AI only.
- **Thin `ADDED Requirements` block in `project-persistence` only.** This is a config-only change, so we need at least one delta to satisfy the OpenSpec validator. We add a single thin `ADDED Requirements` block to `project-persistence` (the cross-cutting capability) titled `OpenSpec context and rules configured`, with three short scenarios that pin the new `context:` and `rules:` blocks. This is the same trade-off we made in `fill-spec-purposes`, just smaller: one spec, one requirement, three scenarios. The thinness keeps the requirement from misrepresenting a real `project-persistence` feature.

## Risks / Trade-offs

- **[Risk] The `context:` and `rules:` blocks become stale as the project evolves.** → Mitigation: the team can edit the config in a follow-up change; the convention is established.
- **[Risk] The static-site guardrail is duplicated in `AGENTS.md` and `config.yaml` and they may drift.** → Mitigation: this is accepted as a small, low-cost duplication. A future change can deduplicate.
- **[Risk] Adding a meta `ADDED Requirements` to `project-persistence` is slightly awkward** (a requirement about config change living in a spec about JSON persistence). → Mitigation: we are explicit in the requirement title (`OpenSpec context configured`) and the requirement text names what changed. The review can see the intent.
- **[Risk] The change is the smallest possible "real" change** (one config edit + one thin delta). Reviewers may ask whether the work justifies the change. → Mitigation: this is a follow-up to the housekeeping list captured in the `bootstrap-initial-specs` design; we are tracking the items the team agreed to address. The fact that it is small is the point.

## Migration Plan

Documentation/config-only change. Steps:

1. Edit `openspec/config.yaml` to add `context:` and `rules:`.
2. Add the thin `ADDED Requirements` delta to `openspec/changes/configure-openspec-context/specs/project-persistence/spec.md`.
3. `openspec validate configure-openspec-context`.
4. `openspec archive configure-openspec-context --yes` to record the housekeeping.

Rollback, if needed, is `rm -rf openspec/changes/configure-openspec-context` and reverting `config.yaml`.

## Open Questions

- _Should the static-site guardrail live in `AGENTS.md` (humans) only, and the `rules:` block reference `AGENTS.md` by name instead of duplicating the rule?_ This is the cleanest long-term shape; we are not making that refactor in this change.
- _Should we add a `rules.proposal` line about keeping proposals under one page, mirroring the example in the OpenSpec template?_ Probably yes; we will include it in the final config.
