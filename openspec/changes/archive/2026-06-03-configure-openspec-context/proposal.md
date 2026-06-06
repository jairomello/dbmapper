## Why

`openspec/config.yaml` is currently the bare default the CLI generated when OpenSpec was first initialized: it only declares `schema: spec-driven` and has no `context:` and no `rules:` blocks. The CLI injects this content into every artifact instruction as project background and per-artifact rules; without it, future agents writing proposals, specs, designs, and tasks have to re-derive the project context (tech stack, conventions, language) from `AGENTS.md` and the source tree on every change. Now that the team is actively adopting OpenSpec (three housekeeping changes archived this week, more inbound), populating the config pays off immediately: every future artifact is generated with the right framing in mind.

## What Changes

- Add a `context:` block to `openspec/config.yaml` that captures the project's tech stack, conventions, and product domain in 5–8 lines.
- Add a `rules:` block with a small set of per-artifact rules: short proposals, scenarios in `WHEN`/`THEN`, tasks in `- [ ]` checkbox format, design docs only when the change is cross-cutting, and a guardrail that the static-site setup must not be replaced with a bundler or framework without explicit approval (mirroring the `AGENTS.md` rule).
- Add a thin `ADDED Requirements` block to `project-persistence` titled `OpenSpec context and rules configured` so the change satisfies the OpenSpec validator's "must have at least one delta" rule. The block is documentation of the config change, not a new product feature.
- No code is touched. No tests are touched.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

_None._

## Impact

- `openspec/config.yaml`: edit. The file is read by `openspec new change`, `openspec instructions`, and `openspec validate` for every subsequent artifact, so the change is purely additive for future work and does not modify any existing capability.
- `openspec/changes/`: a new `configure-openspec-context/` directory is created and will be archived when this change is closed.
- `openspec/specs/`: `project-persistence` gains one thin `OpenSpec context and rules configured` requirement (3 scenarios).
- `app.js`, `index.html`, `style.css`, `dbviewr.html`, `AGENTS.md`, `tests/*`: not modified.
- No build step, no new dependencies, no deployment impact.
