# Real Integrations — file an issue in your tracker

TraceBug can create a **real** issue or message in your tracker — GitHub, Linear, or Slack. The call goes **directly from your browser to the tracker**; no TraceBug server is in the path (ADR 001, ADR 010).

## In the extension

1. **Save a credential once** in TraceBug settings (right-click the toolbar icon → Options):

   | Tracker | Under "Advanced: use a token" | Where to get it |
   |---|---|---|
   | **GitHub** | Personal access token (`repo` scope). Default repository is optional. | github.com → Settings → Developer settings → Personal access tokens |
   | **Linear** | Personal API key. Default team is optional. | Linear → Settings → API → Personal API keys |
   | **Slack** | Incoming webhook URL | Slack → your app → Incoming Webhooks |

   Saving asks the browser for access to that one tracker's API host. Credentials live in the extension's own storage, which the sites you test cannot read.

2. **File from a ticket.** Click **Send to GitHub** (or Linear). TraceBug opens its own **Create an issue** window:
   - the report title and body, exactly as they will be sent, with warnings (remote images, @mentions, a shortened body);
   - **Create in** — GitHub or Linear;
   - a searchable **Repository** / **Team** picker, listed from your account;
   - **Labels** for the repository you picked (GitHub);
   - **Create issue**. The issue opens in a new tab and the ticket shows its number.

   Your last repository/team and labels are remembered for the next report. Nothing is sent until you click Create; closing the window cancels.

**Why a separate window:** the ticket runs inside the page you are testing, so anything shown there — your private repository names, teams, people — could be read by that site. The Create window belongs to the extension; the page only ever hands it the report text.

**Coming next (Chrome first):** a **Connect** button that signs in to GitHub, Linear, Azure DevOps and GitLab without a token, and Jira Cloud with an API token. It appears in settings and in the Create window once each tracker's app is registered; until then, and in Firefox, the token path above is the way in.

**Slack** stays a webhook: the message is posted as it is, with no picker.

## In the npm SDK (page mode)

The SDK has no extension window, so it files straight from the page with the config you give it — your own app, your own token:

- **GitHub** → `POST /repos/{owner}/{repo}/issues`, then opens the created issue in a new tab. The full report body is sent (no URL truncation).
- **Linear** → GraphQL `issueCreate`. Opens the created issue; the toast shows its identifier (e.g. `ENG-42`).
- **Slack** → incoming-webhook POST. Fire-and-forget (Slack webhooks are CORS-opaque, so success is reported optimistically).

In page mode the config lives in that page's `localStorage` under `tracebug_integrations`. If a provider is **not** configured, the button falls back to the previous behavior (prefilled `/issues/new` URL for GitHub/Linear, copy-to-clipboard for Slack).

## Jira?

Jira export is **copy-markup** for now (formatted ticket text you paste). Jira Cloud's REST API doesn't send CORS headers, so a page can't call it, but the extension's background worker isn't bound by page CORS. A later step adds Jira Cloud filing in the extension with your site URL, email and API token. There is no proxy: Atlassian's sign-in needs a client secret, and TraceBug never holds one (ADR 010).

## Programmatic use (SDK)

```ts
import TraceBug, { setIntegrationsConfig, createTrackerIssue } from "tracebug-sdk";

setIntegrationsConfig({ github: { token: "ghp_…", repo: "acme/app", labels: ["bug"] } });

const report = TraceBug.generateReport();
const { url, ref } = await createTrackerIssue("github", report);
console.log(`Filed ${ref} → ${url}`);
```

Individual adapters (`createGitHubIssue`, `createLinearIssue`, `sendSlackMessage`) are also exported and accept an `AbortSignal`.
