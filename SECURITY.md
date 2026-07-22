# Security Policy

TraceBug is a browser SDK + extension that captures debugging data (DOM, console,
network, screenshots) and packages it into a self-contained `.html` report. Because
it runs inside other people's pages and produces files that get shared, we take
security and data-handling seriously.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately through GitHub's **[private vulnerability reporting](https://github.com/prashantsinghmangat/TraceBug-ai/security/advisories/new)**
(the repo's **Security → Advisories → Report a vulnerability** button). If that
isn't available to you, contact the maintainer via the `author` field in
[`package.json`](package.json) / the [GitHub profile](https://github.com/prashantsinghmangat).

Please include:

- A description of the issue and its impact.
- Steps to reproduce (a proof of concept if possible).
- The affected surface: **npm SDK**, **Chrome/Chromium extension**, or the
  **exported `.html` report**, plus version and browser.

**What to expect:** an acknowledgment within a few days, an assessment of severity,
and a fix or mitigation plan. We practice coordinated disclosure — please give us a
reasonable window to release a fix before any public write-up.

## Supported versions

TraceBug is pre-1.0-adoption and ships from a single active line. Security fixes
land on the **latest `1.x` release**; please upgrade to the newest version before
reporting.

| Version | Supported |
| --- | --- |
| latest `1.x` | ✅ |
| older | ❌ (upgrade first) |

## Scope

In scope — issues that let a **malicious page, report, or input** do something it
shouldn't:

- **XSS / script execution** when an exported `.html` report is opened (session
  data — page URLs, console messages, network responses, storage values — is
  escaped before rendering; a bypass is in scope).
- **Data leakage / redaction bypass**: sensitive values that should be masked
  appearing in a report — via `maskAllInputs`, `.tb-block` / `.tb-mask`,
  redacted storage keys, the capture-time token-shape scrub (JWTs, Bearer
  headers, API keys in console output / error stacks / network snippets /
  URLs), user-declared `redact` rules (fields/patterns), or element-level
  blur (`data-tb-blurred` + `tb-mask`) failing to cover the recording or the
  DOM replay; or the offline replay making unexpected network requests.
- **Extension privilege issues**: permission escalation, cross-origin data access
  beyond the per-tab opt-in model, or the content script leaking data to a page.
- Anything that lets TraceBug **break or compromise the host application** it's
  embedded in.

Out of scope:

- Bugs in the host application being debugged (TraceBug only observes it).
- Findings that require a already-compromised machine or a malicious browser
  extension running alongside TraceBug.
- The optional cloud share portal, which is **gated off by default**
  (`PHASE2-CLOUD`) and not part of the shipping product.

## Data & privacy posture

By design, nothing leaves the user's machine unless they explicitly export, share,
or file an issue. There is no crash telemetry and no analytics beacon. See
[SUPPORT.md](SUPPORT.md) and the Privacy sections of the [README](README.md) and
[ARCHITECTURE.md](ARCHITECTURE.md) for details.
