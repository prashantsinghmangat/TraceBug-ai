# HAR Export

TraceBug can export a session's captured network activity as a standard **HAR 1.2** (HTTP Archive) file — the interchange format every browser DevTools, Charles, Fiddler, and Postman reads. A capture drops straight into any existing network-debugging workflow.

## How to export

In the Quick Bug modal, click **🌐 Export HAR**. A `.har` file downloads with every captured request in chronological order. Open it in:

- **Chrome/Edge/Firefox DevTools** → Network tab → right-click → *Import HAR*
- **Charles / Fiddler / Proxyman** → File → Import
- **Postman** → Import → the requests become a collection

## What's in it

For each request TraceBug captured:

| HAR field | Source |
|---|---|
| `request.method`, `request.url` | The captured method and (sanitized) URL |
| `request.queryString` | Parsed from the URL into `name`/`value` pairs |
| `response.status`, `response.statusText` | The captured status + its standard reason phrase |
| `response.content.text` | The failed-response body snippet (failures only) |
| `response.content.mimeType` | Guessed from the body shape (JSON / HTML / XML / text) |
| `time`, `timings.wait` | The captured request duration |
| `pages[0]`, `browser` | The page URL and browser/version from the environment |

Fields TraceBug doesn't capture — request/response **headers** and **cookies** — are emitted as empty arrays, and timing phases we didn't measure as `-1`, both valid per the HAR 1.2 schema. URLs are already sanitized at capture (sensitive query params replaced with `[REDACTED]`).

## Programmatic use (SDK)

```ts
import TraceBug, { buildHar, exportSessionAsHar } from "tracebug-sdk";

const report = TraceBug.generateReport();

// Pure — returns the HAR 1.2 object, no side effects:
const har = buildHar(report, "1.6.0");
console.log(har.log.entries.length);

// Or build + trigger a browser download:
const { filename, entryCount } = exportSessionAsHar(report);
```

## Why this matters

No competitor in the category ships a HAR export — Jam even markets "everything a HAR offers" without one. Because TraceBug already captures the request/response data and runs zero-backend, exporting it as a portable, tool-agnostic file is a natural fit and a clean data-ownership story: your network capture is a standard file you own, not a row in someone's cloud.
