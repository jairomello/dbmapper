## 1. Edit config.yaml

- [x] 1.1 Add a `context:` block to `openspec/config.yaml` describing the tech stack, conventions, and product domain
- [x] 1.2 Add a `rules:` block covering `proposal`, `design`, `specs`, and `tasks` with the per-artifact constraints
- [x] 1.3 Verify the YAML is still valid (no trailing whitespace, no mixed indentation) — quoted the two list items with embedded `:` so `python3 -c "import yaml; yaml.safe_load(open('config.yaml'))"` parses cleanly

## 2. Validate

- [x] 2.1 Run `openspec validate configure-openspec-context` and confirm the change is well-formed
- [x] 2.2 Run `openspec show configure-openspec-context` and skim the rendered output

## 3. Archive

- [ ] 3.1 Run `openspec archive configure-openspec-context --yes` to record the housekeeping
- [ ] 3.2 Confirm `openspec/list --specs` shows `project-persistence` with one additional requirement
- [ ] 3.3 Open `openspec/config.yaml` and visually confirm the new blocks are present and well-formed
