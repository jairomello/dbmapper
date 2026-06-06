## ADDED Requirements

### Requirement: OpenSpec context and rules configured
The project SHALL declare a `context:` block in `openspec/config.yaml` describing the tech stack, conventions, and product domain, and a `rules:` block with per-artifact constraints (proposal, design, specs, tasks). The static-site setup (no bundler, no framework, no `package.json` test script) is the project's defining constraint and MUST be reflected in the context.

#### Scenario: Context block exists and is non-empty
- **WHEN** a future change is created and the CLI injects the project context into artifact instructions
- **THEN** `openspec/config.yaml` MUST contain a `context:` block with at least one non-empty line
- **AND** the block MUST mention the static-site constraint and the ad-hoc Node test style

#### Scenario: Rules block exists with the four artifact types
- **WHEN** the CLI loads `openspec/config.yaml`
- **THEN** the `rules:` block MUST contain at least one rule for each of `proposal`, `specs`, and `tasks`
- **AND** the rules MUST include the no-bundler / no-framework guardrail

#### Scenario: Schema remains spec-driven
- **WHEN** `openspec/config.yaml` is read
- **THEN** the top-level `schema:` value MUST remain `spec-driven`
