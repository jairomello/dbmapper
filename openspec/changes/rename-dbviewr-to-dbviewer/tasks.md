## 1. Rename the four viewer source files

- [ ] 1.1 `git mv dbviewr.html dbviewer.html`
- [ ] 1.2 `git mv dbviewr.js dbviewer.js`
- [ ] 1.3 `git mv dbviewr.css dbviewer.css`

## 2. Update the renamed HTML, JS, and CSS files

- [ ] 2.1 In `dbviewer.html`, change the `<title>` from `DBViewr - Dicionário de Dados` to `DBViewer - Dicionário de Dados`
- [ ] 2.2 In `dbviewer.html`, change the in-page brand text from `DBViewr` to `DBViewer`
- [ ] 2.3 In `dbviewer.html`, update the `<link rel="stylesheet" href="dbviewr.css">` to `<link rel="stylesheet" href="dbviewer.css">`
- [ ] 2.4 In `dbviewer.html`, update the `<script src="dbviewr.js">` to `<script src="dbviewer.js">`
- [ ] 2.5 In `dbviewer.js`, replace the localStorage key `dbviewr-theme` with `dbviewer-theme` in both the `setItem` and `getItem` calls
- [ ] 2.6 Confirm no other occurrence of `dbviewr` / `DBViewr` remains in `dbviewer.html`, `dbviewer.js`, or `dbviewer.css`

## 3. Rename and update the executable contract

- [ ] 3.1 `git mv tests/dbviewr.test.js tests/dbviewer.test.js`
- [ ] 3.2 In `tests/dbviewer.test.js`, point the `fs.readFileSync` calls at `dbviewer.html`, `dbviewer.js`, and `dbviewer.css`
- [ ] 3.3 In `tests/dbviewer.test.js`, change the title assertion to `<title>DBViewer - Dicionário de Dados</title>`
- [ ] 3.4 In `tests/dbviewer.test.js`, change the localStorage assertion to `localStorage.setItem('dbviewer-theme'`
- [ ] 3.5 In `tests/dbviewer.test.js`, update the inline-block guard messages to reference `dbviewer.html`
- [ ] 3.6 Change the final `console.log('dbviewr.test.js: ok')` to `console.log('dbviewer.test.js: ok')`
- [ ] 3.7 Run `node tests/dbviewer.test.js` and confirm it prints `dbviewer.test.js: ok`

## 4. Rename the OpenSpec capability and update the spec body

- [ ] 4.1 `git mv openspec/specs/dbviewr openspec/specs/dbviewer`
- [ ] 4.2 In `openspec/specs/dbviewer/spec.md`, change the H1 from `# dbviewr Specification` to `# dbviewer Specification`
- [ ] 4.3 In `openspec/specs/dbviewer/spec.md`, replace every `dbviewr.html`, `dbviewr.js`, `dbviewr.css`, `tests/dbviewr.test.js`, and `dbviewr-theme` reference with the `dbviewer.*` equivalent
- [ ] 4.4 In `openspec/specs/dbviewer/spec.md`, replace the `## Purpose` paragraph so it names `dbviewer.html` and `tests/dbviewer.test.js` instead of the old paths
- [ ] 4.5 Confirm no `dbviewr` or `DBViewr` substring remains in `openspec/specs/dbviewer/spec.md`

## 5. Update cross-references in adjacent specs

- [ ] 5.1 In `openspec/specs/static-site-security/spec.md`, replace every `dbviewr.html`, `dbviewr.js`, `dbviewr.css`, and `tests/dbviewr.test.js` with the `dbviewer.*` equivalent
- [ ] 5.2 In `openspec/specs/project-persistence/spec.md`, replace `DBViewr` with `DBViewer` and `dbviewr.html` with `dbviewer.html`
- [ ] 5.3 In `openspec/config.yaml`, replace the `dbviewr.html` and `dbviewr` capability name references with the `dbviewer.*` equivalents

## 6. Update cross-references in OpenSpec change folders

- [ ] 6.1 Walk every file under `openspec/changes/` (including `archive/`) and replace `dbviewr` / `DBViewr` with `dbviewer` / `DBViewer` so the historical record matches the published name

## 7. Update human-facing docs and the .gitignore

- [ ] 7.1 In `AGENTS.md`, replace every `dbviewr` / `DBViewr` reference with `dbviewer` / `DBViewer` and update the executable contract path
- [ ] 7.2 In `README.md`, replace every `dbviewr` / `DBViewr` reference (including the URL `http://localhost:8000/dbviewr.html`) with the `dbviewer` equivalent
- [ ] 7.3 In `CONTRIBUTING.md`, update the `tests/dbviewr.test.js` reference and the capability name
- [ ] 7.4 In `SECURITY.md`, replace every `dbviewr.html`, `dbviewr.js`, `dbviewr.css`, and `tests/dbviewr.test.js` reference with the `dbviewer.*` equivalent
- [ ] 7.5 In `THIRD_PARTY_NOTICES`, replace `dbviewr.html` with `dbviewer.html`
- [ ] 7.6 In `.gitignore`, update the project-source comment line

## 8. Final sweep

- [ ] 8.1 Run `rg -n 'dbviewr|DBViewr|dbViewr' .` (excluding the OpenSpec change folder and `.git/`) and confirm zero remaining hits
- [ ] 8.2 Run `node tests/dbviewer.test.js` and confirm it prints `dbviewer.test.js: ok`
- [ ] 8.3 Run `node tests/sql-import.test.js`, `node tests/update-model.test.js`, `node tests/coverage-stats.test.js`, and `node tests/project-persistence.test.js` and confirm they all pass (the rename should not affect them)
- [ ] 8.4 Open `dbviewer.html` in the browser, confirm the title and brand show `DBViewer`, open a project JSON, and confirm the theme toggle persists across reloads under the `dbviewer-theme` key

## 9. Validate

- [ ] 9.1 Run `openspec validate rename-dbviewr-to-dbviewer --strict` and confirm it exits 0

## 10. Archive

- [ ] 10.1 Commit the change with an imperative message
- [ ] 10.2 `git push origin main`
- [ ] 10.3 Run `openspec archive rename-dbviewr-to-dbviewer --yes` to move the change under `openspec/changes/archive/`
