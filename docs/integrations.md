# Real Integrations — BYO-Token Issue Creation

TraceBug can create a **real** issue or message in your tracker — GitHub, Linear, or Slack — using **your own token**. The call goes **directly from the browser to the provider**; TraceBug never sees your token (it lives only in `localStorage`) and no TraceBug backend is in the path.

This is the same privacy-preserving pattern as the [AI Debugger](ai-debugger.md): no OAuth, no client secret, no cloud middleman. It also lifts the old ~6–8 KB URL-prefill cap — the full report body now travels in the API request, not a query string.

## Setup

In the Quick Bug modal, open **More ▾ → 🔗 Configure integrations** and fill in only the providers you use:

| Provider | What to enter | Where to get it |
|---|---|---|
| **GitHub** | Personal access token (`repo` scope) + `owner/repo` + optional labels | github.com → Settings → Developer settings → Personal access tokens |
| **Linear** | Personal API key + Team ID | Linear → Settings → API → Personal API keys |
| **Slack** | Incoming webhook URL | Slack → your app → Incoming Webhooks |

Tokens are stored under `tracebug_integrations` in this browser's `localStorage`. **Remove all** clears them.

## How it behaves

Once a provider is configured, its export button **files for real**:

- **GitHub** → `POST /repos/{owner}/{repo}/issues`. Opens the created issue in a new tab. The full report body is sent (no URL truncation).
- **Linear** → GraphQL `issueCreate`. Opens the created issue; the toast shows its identifier (e.g. `ENG-42`).
- **Slack** → incoming-webhook POST. Fire-and-forget (Slack webhooks are CORS-opaque, so success is reported optimistically).

If a provider is **not** configured, the button falls back to the previous behavior (prefilled `/issues/new` URL for GitHub/Linear, copy-to-clipboard for Slack) — nothing breaks.

## Why not OAuth / a cloud connector?

BYO-token keeps the zero-backend, privacy-first positioning: your report data goes only to the tracker you chose, authenticated by a token only your browser holds. It also means integrations work on any site instantly, with no TraceBug account.

## Jira?

Jira Cloud's REST API doesn't send CORS headers for browser XHR, so a direct browser call is blocked. Jira export therefore stays **copy-markup** (formatted ticket text you paste) for now. A proxy-based path could enable real Jira creation later without changing the others.

## Programmatic use (SDK)

```ts
import TraceBug, { setIntegrationsConfig, createTrackerIssue } from "tracebug-sdk";

setIntegrationsConfig({ github: { token: "ghp_…", repo: "acme/app", labels: ["bug"] } });

const report = TraceBug.generateReport();
const { url, ref } = await createTrackerIssue("github", report);
console.log(`Filed ${ref} → ${url}`);
```

Individual adapters (`createGitHubIssue`, `createLinearIssue`, `sendSlackMessage`) are also exported and accept an `AbortSignal`.
