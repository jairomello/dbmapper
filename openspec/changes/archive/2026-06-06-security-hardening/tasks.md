## 1. Validate proposal and design

- [ ] 1.1 Read `proposal.md` and confirm the three closed limitations match the items in `SECURITY.md`
- [ ] 1.2 Read `design.md` and confirm the SRI/CSP/`<meta>`/extraction decisions and the `'unsafe-inline'` trade-off for `dbmapper.html` are accepted

## 2. Implement SRI and CSP on the editor

- [ ] 2.1 In `dbmapper.html`, add a `<meta http-equiv="Content-Security-Policy" …>` tag right after the viewport meta. Use `default-src 'self'`, `script-src 'self' https://cdnjs.cloudflare.com`, `style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com`, `font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com`, `img-src 'self' data:`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`
- [ ] 2.2 In `dbmapper.html`, add `integrity="sha384-5KZdSYqynSzIjQGS2M1O3HW6HVDBjfNx0v5Y2eQuE3vvQ9NTiiPK9/GWc0yYCrgw"`, `crossorigin="anonymous"`, and `referrerpolicy="no-referrer"` to the Materialize CSS `<link>` tag
- [ ] 2.3 In `dbmapper.html`, add `integrity="sha384-ZOED+d9HxogEQwD+jFvux96iGQR9TxfJO+mPF2ZS0TuKH6eWrmvPsDpO6I0OWdiX"`, `crossorigin="anonymous"`, and `referrerpolicy="no-referrer"` to the Materialize JS `<script>` tag
- [ ] 2.4 In `dbmapper.html`, replace `onclick="document.getElementById('input-sql').click()"` on the welcome-screen CTA with `id="btn-import-sql-cta"`
- [ ] 2.5 In `app.js`'s `setupEventListeners`, register a click handler for `#btn-import-sql-cta` that calls `document.getElementById('input-sql').click()` (guard with a presence check so the test runner does not need the button to exist)

## 3. Extract DBViewer CSS and JS to standalone files

- [ ] 3.1 Create `dbviewer.css` at the repo root with the contents of the inline `<style>` block in `dbviewer.html` (dedented to 4-space indent, no leading blank line)
- [ ] 3.2 Create `dbviewer.js` at the repo root with the contents of the inline `<script>` block in `dbviewer.html` (dedented to 4-space indent, no leading blank line)
- [ ] 3.3 In `dbviewer.html`, replace the inline `<style>…</style>` block with `<link rel="stylesheet" href="dbviewer.css">`
- [ ] 3.4 In `dbviewer.html`, replace the inline `<script>…</script>` block with `<script src="dbviewer.js"></script>`
- [ ] 3.5 In `dbviewer.html`, add a `<meta http-equiv="Content-Security-Policy" …>` tag right after the viewport meta. Use `default-src 'self'`, `script-src 'self'`, `style-src 'self' https://fonts.googleapis.com`, `font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com`, `img-src 'self' data:`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` (no `'unsafe-inline'` anywhere)

## 4. Update the DBViewer test contract

- [ ] 4.1 Rewrite `tests/dbviewer.test.js` to read `dbviewer.js` and `dbviewer.css` in addition to `dbviewer.html`
- [ ] 4.2 Move the `body.theme-dark`, `function normalizeProject`, `function computeStats`, `function renderTable`, `function renderRelationships`, `relationships-panel`, `Filha de`, `Mãe de`, `function applyTheme`, `table.status !== 'REMOVED'`, and `localStorage.setItem('dbviewer-theme'` assertions to `dbviewer.js`; move the `body.theme-dark` class assertion to `dbviewer.css`
- [ ] 4.3 Add new assertions: `dbviewer.html` contains `<script src="dbviewer.js"></script>` and `<link rel="stylesheet" href="dbviewer.css">`; `dbviewer.html` contains no `<script>` block and no `<style>` block

## 5. Update docs

- [ ] 5.1 In `SECURITY.md`, move the three closed items (CDN SRI, no CSP, inline DBViewer JS) from "Limitações conhecidas" into "O que o app faz e não faz" and replace them with three new honest limitations (CSP via `<meta>`, `'unsafe-inline'` in `style-src` for `dbmapper.html`, SRI hashes are version-pinned)
- [ ] 5.2 In `AGENTS.md`, expand the project-structure bullet list to mention `dbviewer.html`, `dbviewer.css`, and `dbviewer.js`

## 6. Run the full test surface

- [ ] 6.1 Run `node tests/sql-import.test.js` and confirm exit `0`
- [ ] 6.2 Run `node tests/update-model.test.js` and confirm exit `0`
- [ ] 6.3 Run `node tests/dbviewer.test.js` and confirm exit `0`
- [ ] 6.4 Run `node tests/coverage-stats.test.js` and confirm exit `0`
- [ ] 6.5 Run `node tests/project-persistence.test.js` and confirm exit `0`
- [ ] 6.6 Serve the site with `python3 -m http.server 8000` and load `dbmapper.html` and `dbviewer.html` in a browser. Confirm no console errors and no CSP violation reports

## 7. Validate the change with the OpenSpec CLI

- [ ] 7.1 Run `openspec validate security-hardening` from the repository root and resolve any reported errors
- [ ] 7.2 Run `openspec show security-hardening` and confirm eight capability deltas are listed (one new `static-site-security`, one modified `dbviewer`, six cross-cutting adds)
- [ ] 7.3 Open `openspec/changes/security-hardening/specs/static-site-security/spec.md` and confirm every `#### Scenario:` uses exactly four hashtags

## 8. Archive the change

- [ ] 8.1 After review approval, run `openspec archive security-hardening --yes` to promote the delta specs to `openspec/specs/<capability>/spec.md`
- [ ] 8.2 Run `openspec list --specs` and confirm eight capabilities are listed, including the new `static-site-security`
- [ ] 8.3 Confirm `openspec/changes/security-hardening/` is removed and `openspec/specs/` now contains the eight new/updated capability folders

## 9. Follow-up housekeeping (out of scope for this change, track separately)

- [ ] 9.1 Open a follow-up change to drop `'unsafe-inline'` from the editor's `style-src` by migrating the four `style="display: none;"` toggles in `dbmapper.html` to the HTML5 `hidden` attribute and updating `app.js` to toggle `.hidden` instead of `.style.display`
- [ ] 9.2 Open a follow-up change to recompute and pin SRI hashes for Google Fonts once the Google Fonts CSS API exposes stable per-URL hashes (currently exempted by design)
