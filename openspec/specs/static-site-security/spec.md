# static-site-security Specification

## Purpose
TBD - created by archiving change security-hardening. Update Purpose after archive.
## Requirements
### Requirement: Subresource Integrity on every third-party CDN resource

Every `<link rel="stylesheet">` and `<script src>` that points to a third-party CDN MUST load with an `integrity` attribute whose value is a `sha384-` hash of the exact bytes served at the pinned URL, and MUST also carry `crossorigin="anonymous"`. If the upstream file changes, the browser MUST refuse to apply it. Google Fonts is the only third-party resource that is exempt from this rule, because the Google Fonts CSS API version-locks the served font files in its query string and the API already serves `Access-Control-Allow-Origin: *` with content-hashed `.woff2` payloads.

#### Scenario: Materialize CSS carries SRI

- **WHEN** `dbmapper.html` is loaded
- **THEN** the Materialize CSS `<link>` tag MUST carry an `integrity="sha384-…"` value that matches the bytes of the file at the pinned cdnjs URL
- **AND** it MUST also carry `crossorigin="anonymous"`
- **AND** the URL MUST be pinned to a specific version path (no floating `latest`)

#### Scenario: Materialize JS carries SRI

- **WHEN** `dbmapper.html` is loaded
- **THEN** the Materialize JS `<script>` tag MUST carry an `integrity="sha384-…"` value that matches the bytes of the file at the pinned cdnjs URL
- **AND** it MUST also carry `crossorigin="anonymous"`
- **AND** the URL MUST be pinned to a specific version path (no floating `latest`)

#### Scenario: SRI failure blocks execution

- **WHEN** the bytes served at the pinned Materialize URL do not match the pinned hash
- **THEN** the browser MUST refuse to apply the stylesheet or run the script
- **AND** the page MUST fail closed (Materialize-dependent UI does not appear) rather than fall back to running unverified code

### Requirement: Content-Security-Policy meta tag in every HTML page

Every HTML page that ships as part of the site (`dbmapper.html`, `dbviewer.html`, and any future page) MUST declare a `Content-Security-Policy` via `<meta http-equiv="Content-Security-Policy">` in the `<head>`. The policy MUST set `default-src` to `'self'` and MUST open only the explicit allowlists that the page actually needs for `script-src`, `style-src`, `font-src`, `img-src`, and `connect-src`. The policy MUST also set `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and `frame-ancestors 'none'`.

#### Scenario: Both pages declare a CSP

- **WHEN** a reader inspects `dbmapper.html` or `dbviewer.html`
- **THEN** the page MUST contain a `<meta http-equiv="Content-Security-Policy" …>` tag in the `<head>`
- **AND** the policy MUST start with `default-src 'self'`
- **AND** the policy MUST end with the four transport-restriction directives `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and `frame-ancestors 'none'`

#### Scenario: script-src is the minimal allowlist

- **WHEN** the CSP is evaluated
- **THEN** `script-src` MUST allow `'self'` and, where the page loads third-party scripts, the exact origin of each script (currently `https://cdnjs.cloudflare.com` for Materialize in `dbmapper.html`)
- **AND** `script-src` MUST NOT include `'unsafe-inline'`
- **AND** `script-src` MUST NOT include wildcard origins

#### Scenario: font-src allows the actual font hosts

- **WHEN** the CSP is evaluated
- **THEN** `font-src` MUST allow `'self'` and the origin(s) that actually serve the font files used by the page
- **AND** the DBMapper CSP MUST list `https://fonts.gstatic.com` and `https://fonts.googleapis.com` because both pages use Google Fonts and Material Icons

### Requirement: No inline scripts, styles, or event handlers in HTML source

No HTML page in the site MUST contain an inline `<script>…</script>` block, an inline `<style>…</style>` block, or an `on*=` event handler attribute (`onclick`, `onload`, `onerror`, etc.). All JavaScript MUST live in external files referenced via `<script src>`. All CSS MUST live in external files referenced via `<link rel="stylesheet">`. All event wiring MUST be done in JavaScript via `addEventListener`.

#### Scenario: dbviewer.html has no inline script or style block

- **WHEN** `dbviewer.html` is parsed
- **THEN** it MUST NOT contain a `<script>` or `<style>` block in its source
- **AND** it MUST reference `dbviewer.js` and `dbviewer.css` via `<script src>` and `<link rel="stylesheet">`
- **AND** the executable contract for the DBViewer (`tests/dbviewer.test.js`) MUST assert both the absence of inline blocks and the presence of the external references

#### Scenario: dbmapper.html has no inline event handlers

- **WHEN** `dbmapper.html` is parsed
- **THEN** it MUST NOT contain any `on*=` attribute (the `onclick` on the welcome-screen CTA that existed before this capability was added was the only offender, and is now wired through `addEventListener` in `app.js`)

### Requirement: External resources are served as separate, cacheable files

JavaScript and CSS MUST live in their own files at the repo root, with a name that matches the page that uses them (e.g., `dbviewer.html` is paired with `dbviewer.js` and `dbviewer.css`; `dbmapper.html` is paired with `app.js` and `style.css`). The browser MUST be able to fetch each file independently of the HTML that references it, and a code-review tool MUST be able to lint or diff each file in isolation.

#### Scenario: Editor files

- **WHEN** the editor is loaded
- **THEN** the page MUST reference `app.js` for behavior and `style.css` for design
- **AND** neither file MUST be embedded in `dbmapper.html`

#### Scenario: Viewer files

- **WHEN** the viewer is loaded
- **THEN** the page MUST reference `dbviewer.js` for behavior and `dbviewer.css` for design
- **AND** neither file MUST be embedded in `dbviewer.html`
- **AND** the files MUST live at the repo root (not inside a `dist/` or `build/` subdirectory, since the project has no build step)

### Requirement: Capability Purpose paragraph

The `## Purpose` section of this spec MUST describe the capability in 1–3 behavior-oriented sentences, must NOT contain the placeholder `TBD - created by archiving`, and MUST name the cross-cutting `static-site-security` contract as the source of the page-delivery rules it depends on.

#### Scenario: Purpose paragraph is non-placeholder

- **WHEN** a reader opens this spec file
- **THEN** the `## Purpose` section MUST NOT contain the string `TBD - created by archiving`
- **AND** the section MUST contain at least one complete sentence describing the capability's user-facing responsibility

### Requirement: Viewer filenames are spelled correctly

The static-site-security controls MUST name the viewer's companion files with the corrected spelling: `dbviewer.html`, `dbviewer.js`, and `dbviewer.css` (not `dbviewr.*`). The misspelled `dbviewr` filename MUST NOT appear in any reference to the viewer in shipped artifacts, docs, tests, or OpenSpec specs.

#### Scenario: Viewer references use the corrected spelling

- **WHEN** a reader inspects `static-site-security/spec.md`, `dbviewer.html`, `tests/dbviewer.test.js`, or any other shipped artifact
- **THEN** the artifact MUST NOT contain the substring `dbviewr` when referring to the viewer

