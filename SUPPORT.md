# Support

## Reporting bugs

Open a [GitHub issue](https://github.com/prashantsinghmangat/TraceBug-ai/issues/new/choose) using the **Bug report** template. Please include:

- SDK version (`npm ls tracebug-sdk`) or extension version (chrome://extensions)
- Browser + OS
- What you did, what you expected, what happened
- Console output from the page (filter for `[TraceBug]`)
- For extension issues: the service-worker console (chrome://extensions → TraceBug → "service worker")

The fastest way to give us a reproducible report is TraceBug itself — record the session where TraceBug misbehaved and attach the exported `.html` file to the issue (review it for sensitive content first).

## Feature requests

Open a [GitHub issue](https://github.com/prashantsinghmangat/TraceBug-ai/issues/new/choose) with the **Feature request** template.

## Questions

- Check the [docs](docs/) first — [getting-started](docs/getting-started.md), [API reference](docs/api-reference.md), [configuration](docs/configuration.md).
- Otherwise open a GitHub issue; there is no separate forum or chat yet.

## Security issues

**Do not open a public issue for security vulnerabilities.** Email the maintainer instead (see the author field in [package.json](package.json) / [GitHub profile](https://github.com/prashantsinghmangat)) with details and reproduction steps. You'll get an acknowledgment within a few days.

## How TraceBug handles its own errors

The SDK is designed to never break the host page: every collector, exporter, and UI handler is wrapped so failures degrade silently or log a `[TraceBug]`-prefixed console warning. There is **no automatic crash telemetry** — nothing about you or your users is phoned home. If TraceBug itself misbehaves, the `[TraceBug]` console output is the diagnostic, which is why we ask for it in bug reports.
