# Delta — project-persistence

## ADDED Requirements

### Requirement: Page is served under the static-site-security controls

The page that hosts this capability (`dbmapper.html`) MUST be served with the SRI, CSP, and "no inline scripts/handlers" controls defined in the `static-site-security` specification.

#### Scenario: Page is served under static-site-security

- **WHEN** `dbmapper.html` is loaded
- **THEN** the page MUST satisfy every `Requirement` of the `static-site-security` capability (SRI on every CDN resource including the Materialize CSS and JS at version `1.0.0` on cdnjs, a `<meta http-equiv="Content-Security-Policy">` in the head, no inline `<script>` or `<style>` block, no `on*=` handlers, and external CSS/JS in standalone files)
