# Design — security-hardening

## Context

The DBMapper/DBViewr pair is a static HTML/CSS/JS site served as-is, with no build step and no server-side component. Before this change, the runtime trust boundary was a single line of CSS/JS per page that loaded Materialize from cdnjs and Google Fonts from Google's CDN. The `SECURITY.md` already described this as the largest open risk: a compromised CDN could ship arbitrary code to every user, and there was no defense-in-depth layer between the network and the app's own DOM rendering.

This change closes the three items that the project itself had flagged as known limitations, and turns the resulting controls into a first-class OpenSpec capability so that future changes cannot regress the security posture.

## Decisions

### D1. SRI is required on every third-party CDN resource, but Google Fonts is exempted

We compute and pin a SHA-384 hash for the Materialize CSS and JS files at the version we already use (`1.0.0`). Both files are loaded with `integrity="sha384-…"`, `crossorigin="anonymous"`, and `referrerpolicy="no-referrer"`. If the upstream file changes, the browser refuses to apply it.

Google Fonts is exempted from SRI for two reasons:

1. The Google Fonts CSS API URL itself version-locks the font files (Inter 400/500/600/700, JetBrains Mono 400/500) by way of its query string. The browser caches the CSS, and the CSS in turn references specific `.woff2` files at `fonts.gstatic.com`.
2. The CSS API also serves `Access-Control-Allow-Origin: *` and the actual font binaries are content-hashed by Google. If we pinned a hash, a routine Google Fonts release would break the page with no security gain.

This trade-off is documented in the new `static-site-security` spec and in `SECURITY.md`.

### D2. CSP is delivered via `<meta>`, not via an HTTP header

The site is meant to be served by any static file server (the README's `python3 -m http.server 8000` is the canonical local server). Requiring a CSP HTTP header would force every operator to configure their server and would break the "open the HTML file directly with `file://`" workflow the README allows.

`<meta http-equiv="Content-Security-Policy">` is a smaller hammer — it cannot set `report-uri`/`report-to`, and some legacy browsers ignore `frame-ancestors` in meta — but it covers the entire script and style surface, which is what we actually need. The new spec encourages but does not require servers to also send the header for additional hardening.

The policy itself is the strictest we can ship without breaking the app:

```
default-src 'self';
script-src 'self' https://cdnjs.cloudflare.com;
style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com;   /* DBMapper only */
style-src 'self' https://fonts.googleapis.com;                    /* DBViewr only */
font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com;
img-src 'self' data:;
connect-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
```

`'unsafe-inline'` in `style-src` is needed only on `dbmapper.html` for the editor's `style="display: none;"` toggles. The DBViewr page has no inline styles, so its `style-src` is clean. A follow-up change can move the editor's `style=""` toggles to a `[hidden]` class and drop `'unsafe-inline'` from the editor's CSP too — this is documented as a remaining limitation in `SECURITY.md`.

### D3. The DBViewr CSS and JS are extracted to standalone files

`dbviewr.html` is reduced from a 1460-line file with embedded CSS+JS to a 115-line shell that links out to `dbviewr.css` and `dbviewr.js`. This:

- makes the viewer's code reviewable in isolation,
- lets the browser cache the script and the stylesheet independently of the HTML,
- makes a strict CSP possible (no inline `<style>` or `<script>` to allow), and
- aligns the viewer with the editor's file layout (which already uses `style.css` and `app.js`).

The file names match the editor's convention: one CSS, one JS, same basename as the HTML.

### D4. The single inline `onclick` is refactored, not preserved

`dbmapper.html` had one `onclick="document.getElementById('input-sql').click()"` on the welcome-screen CTA. To ship a CSP with no `'unsafe-inline'` in `script-src`, we add an `id` to the button and a small event listener in `app.js`'s `setupEventListeners`. This is a 5-line code change and preserves the user-visible behavior.

### D5. `static-site-security` is a peer capability, not a library

In OpenSpec, a cross-cutting concern like "every page must have a CSP" is best modeled as its own capability spec so that:

- it can be referenced from the other specs by a thin `## ADDED Requirements` block, and
- a regression in the security controls is a spec violation that can be caught by review.

We chose to *add* a one-scenario requirement to each of the six non-`dbviewr` capabilities ("this capability's page is served under the controls defined in `static-site-security`") instead of duplicating the security rules in every spec. The single source of truth is `static-site-security/spec.md`; the others link to it.

## Trade-offs

- **SRI hash maintenance.** Pinning SRI means we have to bump a hash whenever Materialize releases a new version. This is a one-line PR per bump, and the cost is much smaller than the cost of a silent CDN compromise.
- **CSP as `<meta>`.** We give up the ability to set `report-uri`/`report-to` and some legacy `frame-ancestors` behavior. In exchange, the controls work in any static hosting setup, including `file://`. The follow-up documentation in the spec and in `SECURITY.md` encourages server-side CSP for additional hardening.
- **Two `dbviewr.*` files instead of one HTML blob.** Adds two files at the repo root and a small navigation cost when reading the code. Pays for itself the first time the viewer needs a CSS or JS change that doesn't touch the HTML.
- **`'unsafe-inline'` still in the editor's `style-src`.** The cleanest fix is to migrate the four `style="display: none;"` toggles to the HTML5 `hidden` attribute and to update `app.js` to toggle `.hidden` instead of `.style.display`. That is a small follow-up change, not part of this hardening pass.

## Migration Plan

Documentation/config-only change at the user level, code-level change at the developer level. Steps:

1. Land the code changes: SRI tags, CSP meta tags, `onclick` refactor, `dbviewr.css` and `dbviewr.js` extraction, `tests/dbviewr.test.js` update.
2. Run the full `tests/` suite and confirm every script exits `0` and prints its `ok` line. All five scripts are part of the executable contract for the affected capabilities.
3. Serve the site locally with `python3 -m http.server 8000` and load both pages in a browser. Verify that Materialize renders, Google Fonts loads, the DBViewr opens a JSON, and the editor's wizard opens. No console errors. No CSP violation reports in the dev tools.
4. Land the new `openspec/specs/static-site-security/spec.md` and the deltas to the seven existing specs.
5. Run `openspec validate security-hardening` from the repo root and resolve any reported errors. If the CLI is not installed locally, the equivalent manual check is: every scenario uses exactly four `####` hashtags, every requirement lives under a `### Requirement: …` heading, the `## Purpose` section of the new spec is a non-placeholder paragraph that names the test contract (none, in this case) and the cross-cutting reference, and the `## MODIFIED Requirements` block for `dbviewr` includes the full updated content of the changed `Internal helpers` requirement.
6. Run `openspec show security-hardening` and skim the rendered output to confirm eight capability deltas are listed (one new, one modified for `dbviewr`, six cross-cutting adds for the other capabilities) and the cross-cutting links resolve.
7. After review approval, run `openspec archive security-hardening --yes` to promote the delta specs to `openspec/specs/<capability>/spec.md`, then `openspec list --specs` to confirm `static-site-security` is in the list.
8. Confirm `openspec/changes/security-hardening/` is removed and `openspec/specs/` now contains the eight capability folders.

Rollback, if needed before archiving, is `rm -rf openspec/changes/security-hardening` and reverting the source files. After archiving, the new capability is part of the spec history and can only be modified through a follow-up change.
