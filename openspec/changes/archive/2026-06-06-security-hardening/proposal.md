## Why

The static-site `SECURITY.md` flagged three open limitations that the project knew about but had not addressed:

1. CDN resources (Materialize CSS/JS) loaded without Subresource Integrity (SRI), so a compromised CDN could ship arbitrary code into the app.
2. No `Content-Security-Policy` (CSP) — the app relied entirely on coding discipline for XSS protection.
3. The DBViewr page had all its CSS and JavaScript embedded in `dbviewr.html` itself, which made the page unhygienic to review and impossible to serve with a strict CSP.

We are closing all three before publishing the project. The same change sets the stage for a new `static-site-security` capability spec that future changes must respect.

## What Changes

- **SRI on every CDN resource.** Add `integrity="sha384-…"` + `crossorigin="anonymous"` to the Materialize CSS and JS tags in `dbmapper.html`, pinned to version `1.0.0` on cdnjs. Google Fonts is excluded because it is served with `Access-Control-Allow-Origin: *` and is already versioned through the Google Fonts CSS API URL.
- **CSP via `<meta http-equiv="Content-Security-Policy">` in both pages.** Restrict `default-src` to `'self'` and open only the explicit allowlists for scripts, styles, fonts, images, and connections the app actually uses. `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and `frame-ancestors 'none'` are enforced to prevent plug-in abuse, `<base>` hijacking, form redirection, and clickjacking. `dbviewr.html` ends up with no `'unsafe-inline'` at all; `dbmapper.html` keeps `'unsafe-inline'` in `style-src` because the editor still uses a few `style="display: none;"` toggles (documented as a known limitation, follow-up friendly).
- **Refactor the only inline `onclick` in `dbmapper.html` (welcome-screen CTA) to a proper `addEventListener` in `app.js`.** This keeps `script-src` free of `'unsafe-inline'` in both pages.
- **Extract `dbviewr.html` inline CSS to `dbviewr.css` and inline JS to `dbviewr.js`.** Both files are referenced from `dbviewr.html` via `<link>` and `<script src>`. This makes the viewer's behavior reviewable in isolation, cacheable, and CSP-friendly.
- **Update `tests/dbviewr.test.js`** to assert the new structure: it now reads `dbviewr.js` and `dbviewr.css` for the script/CSS contracts, and asserts that `dbviewr.html` contains neither `<script>` nor `<style>` blocks.
- **Update `SECURITY.md`** to move the three closed items from "Limitações conhecidas" into "O que o app faz e não faz" and replace them with honest new limitations (CSP via `<meta>` rather than HTTP header; one remaining `'unsafe-inline'` in `style-src`; SRI hashes are version-pinned).
- **Update `AGENTS.md`** to document the new `dbviewr.js` and `dbviewr.css` files in the project-structure list.
- **Add a new capability spec `static-site-security`** that codifies the SRI, CSP, and "no inline scripts/handlers" rules for the whole site, and add a one-scenario cross-reference requirement to every other capability spec that has a runtime surface.

## Capabilities

### New Capabilities

- `static-site-security`: site-wide rules for Subresource Integrity on every CDN resource, a `Content-Security-Policy` meta tag in every HTML page, and a ban on inline `<script>`, `<style>`, and `on*=` handlers in HTML source. Lives next to the existing capabilities and is the only spec whose contract is "this controls the page that hosts all the others".

### Modified Capabilities

- `dbviewr`: the page's CSS and JS are no longer embedded; `dbviewr.html` must reference `dbviewr.css` and `dbviewr.js`, and the DOM/test contract for the viewer now spans three files instead of one. The `Required DOM scaffolding` and `Internal helpers` requirements are updated to reflect this.
- `sql-import`, `project-persistence`, `schema-tree`, `semantic-editor`, `coverage-stats`, `model-update-wizard`: each gains a thin cross-reference requirement that says its runtime page is served under the controls in `static-site-security`. No functional behavior of these capabilities changes.

## Impact

- `dbmapper.html`: new CSP meta tag, SRI on the Materialize CSS and JS tags, the welcome-screen CTA gains `id="btn-import-sql-cta"` and loses its `onclick` attribute. One new file (`dbviewr.js`) is referenced from `dbviewr.html`. No behavioral change.
- `dbviewr.html`: trimmed from ~1460 lines to ~115 lines; the inline `<style>` and `<script>` blocks are replaced by `<link rel="stylesheet" href="dbviewr.css">` and `<script src="dbviewr.js"></script>`. A new CSP meta tag is added in the head.
- `dbviewr.js`, `dbviewr.css`: new files at the repo root, holding the extracted viewer code.
- `app.js`: one new event listener (5 lines) for the welcome-screen CTA button.
- `tests/dbviewr.test.js`: rewritten to assert the new file structure (HTML has no inline script/style, functions live in `dbviewr.js`, the `body.theme-dark` class lives in `dbviewr.css`). Same exit code, same `ok` line.
- `SECURITY.md`: the three "Limitações conhecidas" items for SRI, CSP, and inline DBViewr JS/CSS are removed and replaced with three honest new limitations. Five new "what the app does" items are added under the "O que o app faz e não faz" section.
- `AGENTS.md`: the project-structure bullet list is updated to include `dbviewr.html`, `dbviewr.css`, and `dbviewr.js`.
- `openspec/specs/`: a new `static-site-security/spec.md` is created. `dbviewr/spec.md` is updated (the `Internal helpers` requirement is rewritten to point at `dbviewr.js`). The other six specs each gain one new "Cross-cutting: runs under static-site-security" requirement.
- No external dependencies added or removed. No build step, no bundler, no `package.json`. The `openspec/` directory and the existing `tests/` Node scripts are unchanged in style.
