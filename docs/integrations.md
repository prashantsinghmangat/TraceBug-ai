# Real Integrations — file an issue in your tracker

TraceBug can create a **real** issue or message in your tracker — GitHub, Linear, or Slack. The call goes **directly from your browser to the tracker**; no TraceBug server is in the path (ADR 001, ADR 010).

## In the extension

### GitHub: Connect, no token (Chrome)

Connect once — from the welcome page (step 5), TraceBug settings (GitHub card), or the first time you send:

1. Capture a bug and click **Send to GitHub** in the ticket. TraceBug opens its own **Create GitHub issue** window.
2. The first time, click **Connect GitHub**. TraceBug copies a short code and opens `github.com/login/device`.
   Paste the code, click **Authorize**, and come back: the window says "as <your login>" by itself.
   - GitHub asks you to install **TraceBug Dev** on the repositories it may file into. Add more any time from the
     **Add repositories** link in the window.
3. Pick the **Repository** (settings and the welcome page ask for a default right after you connect), tick
   **Labels** (**bug** starts ticked), choose an **Assignee** and **Milestone** if you want, and click
   **Create issue**. The window shows **Created #123** with a link; nothing opens unless you click it.

You connect once. Next time it is pick → Create, with your last repository and fields preselected. **Disconnect**
lives in TraceBug settings (GitHub card); to revoke the app entirely, use GitHub → Settings → Applications.

Why a code instead of a redirect: GitHub only allows the redirect sign-in for apps that keep a secret on a server,
and TraceBug has no server (ADR 010). The code flow needs no secret.

### With a token (all trackers; Firefox; Linear until its Connect arrives)

In TraceBug settings (right-click the toolbar icon → Options), open **Advanced: use a token** on the tracker's card:

| Tracker | What to paste | Where to get it |
|---|---|---|
| **GitHub** | Personal access token: fine-grained with **Issues: Read and write** on the repos you want, or classic with `repo`. Default repository is optional. | github.com → Settings → Developer settings → Personal access tokens |
| **Linear** | Personal API key. Default team is optional. | Linear → Settings → API → Personal API keys |
| **Slack** | Incoming webhook URL | Slack → your app → Incoming Webhooks |

Saving asks the browser for access to that one tracker's API host. Then **Send to GitHub** (or Linear) opens the
same **Create an issue** window: tracker, a searchable **Repository** / **Team** picker listed from your account,
GitHub labels, assignee and milestone, and **Create issue**.

### The Create window

- It shows the title and body exactly as they will be sent, with warnings (remote images, @mentions, a shortened body).
- Nothing is sent until you click **Create issue**; closing the window cancels.
- If creating fails, the window keeps your choices, shows the error and offers **Retry**; your ticket in TraceBug
  is untouched. If the connection dropped (so GitHub may have created it), Retry first looks for that issue —
  each issue carries an invisible marker — so it is never filed twice.
- If your sign-in expired or was revoked, the window shows **Reconnect GitHub** and keeps your choices.
- **Why a separate window:** the ticket runs inside the page you are testing, so anything shown there — your
  private repository names, teams, people — could be read by that site. The Create window belongs to the
  extension; the page only ever hands it the report text. Credentials live in the extension's own storage.
- GitHub's API can't attach files, so the recording and screenshots download when the issue is created; drag them
  into the issue (the body says which files).

**Coming next (Chrome first):** Connect for Linear, Azure DevOps and GitLab (a sign-in popup, no code), and Jira
Cloud with an API token. Firefox keeps the token path until the Firefox step.

**Slack** stays a webhook: the message is posted as it is, with no picker.

## In the npm SDK (page mode)

The SDK has no extension window, so it files straight from the page with the config you give it — your own app, your own token:

- **GitHub** → `POST /repos/{owner}/{repo}/issues`; the window shows the created issue's link. The full report body is sent (no URL truncation).
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
