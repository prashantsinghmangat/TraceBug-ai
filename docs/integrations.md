# Real Integrations — file an issue in your tracker

TraceBug can create a **real** issue or message in your tracker — GitHub, Linear, or Slack. The call goes **directly from your browser to the tracker**; no TraceBug server is in the path (ADR 001, ADR 010).

## In the extension

### Settings → Manage integrations

Where each connection is managed: **Settings → Manage integrations** (the Create panel's **Manage integrations**
link opens it). At the top, **Sending**: the **Default tracker** (the ticket's main button) and **Open the issue
after creating**, plus **Forget remembered choices** for every site. Then one card per tracker:

- **Status**, in the same words as the popup and the ticket's ▾ tooltip: **Connected**, **Needs reconnect**,
  **Error** or **Not connected**.
- **How it's connected:** "Signed in as octo", or "Using a token ghp_…abcd" (masked; the token itself is never shown).
- **Default repository / team** (a picker), and **Remembered choices on N sites** with **Forget** for that tracker.
- **Connect** (where this build can sign in), **Use a token instead** (GitHub) / **Use an API key instead** (Linear)
  — checked with the tracker before it's saved — and **Disconnect**, which signs out or removes the token and that
  tracker's remembered choices. Slack: the webhook URL, **Save** and **Disconnect**.
- Builds without TraceBug's GitHub App (store builds until it's registered) and Firefox show the token path, open —
  never a Connect button that can't work.
- Keyboard-only, light and dark, no sideways scroll at 360 px.

### The popup's hub

The plug/logo icon in the popup's header opens the same connections as a compact view:

- **My connections (N):** one row per connected tracker — logo, account, default repository or team, and a status:
  **Connected**, **Needs reconnect ⚠** (the sign-in expired or was revoked) or **Error** (TraceBug lost access to the
  tracker's site, e.g. you removed it in Chrome's site access). Actions: **Set default**, **Change default repo/team**,
  **Test connection** (lists your repositories or teams; on Error it asks Chrome for the access again), **Reconnect**,
  and **Disconnect** (asks first; also forgets a pasted token for that tracker).
- **Add platform:** a grid of logos. GitHub, Linear and Slack connect today; GitLab, Azure DevOps and Jira are shown
  as **Coming soon**. A tile opens its connect dialog: the sign-in first (**Sign in with GitHub — recommended**:
  TraceBug asks GitHub for Issues access only, so TraceBug can't read your code), and the token or key second, under
  **Advanced**, with a link to create one and the exact scopes. The tile spins while you sign in; once connected it
  moves to My connections and asks for the default repository or team.
- From the popup, sign-in continues in settings: a popup closes as soon as a sign-in window takes focus.
- **Default tracker:** the ticket's main button sends to it (**Send to GitHub**, **Send to Linear** or **Send to
  Slack**); the others are under **More ▾**. With no choice made, the first connection is the default.
- **Status icon (popup):** the default tracker's logo, with a dot when any connection needs attention; its tooltip
  reads like "GitHub · owner/repo · connected" and it opens the hub.
- **Send button in the ticket (Chrome):** a split button, **Send to GitHub | ▾**. The main part opens the Create panel
  with **Create issue** focused (it takes a click or Enter there: the site you're testing can never file an issue on
  its own). **▾** (or Alt+↓) opens the same panel on the tracker picker. The panel drops down from the button — up
  when there's no room below — and **Manage integrations** in it opens Settings → Integrations. Esc, or Tab past the
  last control, closes it and puts focus back on the button. Nothing connected yet: the button reads **Connect a tracker**
  and the panel offers Connect. The ▾ tooltip names only the tracker ("GitHub · connected", with a dot when a
  connection needs attention), because the site can read the ticket. Firefox: the same button, with the Create window
  instead of the panel.
- **Keyboard:** Tab reaches the grid, then arrow keys, Home/End (Ctrl+Home/End for the first/last tile) and Enter or
  Space. Dialogs keep focus inside, Esc closes them and returns you to the tile. In the Create panel,
  **Ctrl+Enter** (⌘+Enter on Mac) creates the issue and Esc closes it.
- **Firefox:** the same hub; the dialogs offer the token path only until the Firefox step.

### GitHub: Connect, no token (Chrome)

Connect once — from the welcome page (step 5), TraceBug settings (GitHub card), or the first time you send:

1. Capture a bug and click **Send to GitHub** in the ticket. TraceBug opens its own **Create GitHub issue** window.
2. The first time, click **Connect GitHub**. TraceBug copies a short code and opens GitHub's sign-in page in a
   small window (a tab, if the window can't open). Press **Ctrl+V** (⌘V on a Mac), click **Continue**, then
   **Authorize**. When GitHub hands TraceBug the sign-in, TraceBug closes that window and comes back saying "as <your
   login>". If copying failed, use **Copy code** or select the code. Closed GitHub's window too early? Click
   **Reopen GitHub**; the code still works until it expires. Declined on GitHub shows "Cancelled"; an expired code
   offers **Get a new code**.
   - GitHub asks you to install **TraceBug Dev** on the repositories it may file into. Add more any time from the
     **Add repositories** link in the window.
3. Pick the **Repository** (settings and the welcome page ask for a default right after you connect), tick
   **Labels** (**bug** starts ticked), choose an **Assignee** and **Milestone** if you want, and click
   **Create issue**. The panel shows **Created #123** with a link, and the issue opens in a new tab (turn that off
   with **Open the issue after creating** in Settings → Integrations).

You connect once. Next time it is pick → Create, with your last repository and fields preselected. **Disconnect**
lives in TraceBug settings (GitHub card); to revoke the app entirely, use GitHub → Settings → Applications.

Why a code instead of a redirect: GitHub only allows the redirect sign-in for apps that keep a secret on a server,
and TraceBug has no server (ADR 010). The code flow needs no secret.

### Linear: Connect with one click (Chrome)

1. In TraceBug settings (Linear card), on the welcome page (step 5), or from the ticket (**More ▾ → Send to Linear**),
   click **Connect Linear**. Linear's sign-in opens in a popup; approve it and you're back, connected. No key to copy.
   Chrome asks once for the `identity` permission (used only for that popup) and access to Linear.
2. Pick the **Team** (settings and the welcome page ask for a default right after you connect), then **Labels**,
   **Assignee**, **Priority** and **Project** in the panel. They're remembered for next time.
3. **Send to Linear** also sends the ticket's screenshots and the replay `.html` report. TraceBug uploads them to
   Linear and links them in the issue (screenshots show inline). Each file is capped at 20 MB (30 MB per issue). If
   a file can't be uploaded, the issue is still created and the panel names what wasn't attached and why.
   - Linear keeps attachments on separate storage. The first time you create a Linear issue with files, Chrome asks
     once for access to it (the panel says where: "Linear stores attachments on …"). Say no and the issue is still
     created, without the files, and the panel says so. Connecting Linear doesn't ask for it.
4. TraceBug gives each issue an id before sending it, so a retry after a dropped connection finds the issue instead
   of creating a second one.
5. **Disconnect** (settings) signs TraceBug out and revokes its access at Linear. The sign-in renews itself daily;
   if it's revoked, the panel shows **Reconnect Linear** and keeps your choices.

### With a token (all trackers; Firefox)

**In the Create panel (Chrome):** open **Use a token instead** (Linear: **Use an API key instead**), paste it and
press **Check and save**. TraceBug checks it with GitHub or Linear first and says plainly when it's rejected, lacks
the `repo` scope, or can't see the repository you picked; only a working token is saved. It's typed into the
extension's own panel and kept in the extension's storage — the site you're testing never sees it. The panel then
shows it masked ("with a token ghp_…abcd") with **Disconnect**, which removes it. In a build without TraceBug's
GitHub App (store builds until it's registered) this is the way in: Connect is hidden and the box starts open.

**GitHub App on no repositories yet?** After **Connect GitHub**, if the app isn't installed anywhere the panel shows
**Install TraceBug on GitHub**. It opens GitHub's install page in a small window; when you close it (or come back),
the repository list refreshes by itself, and **Refresh** does it by hand. A repository you type that the app isn't
on gets a **Configure repository access on GitHub** link.

### Remembered choices, per site

After you file an issue, TraceBug remembers the repository or team and the labels, assignee and other picks you used
**on that site** — so the next bug from the same site is **Send**, then **Create** (Enter, Enter). Details:

- Kept in the extension's own storage on this device (`chrome.storage.local`), keyed by the site's **origin** only
  (`https://app.example.com`, never a path or query), the tracker, and the account you filed with.
- Nothing is remembered from private (incognito) windows. At most 200 sites are kept; the least recently used go
  first. Disconnecting a tracker deletes its remembered choices; **Forget remembered choices** in Settings →
  Integrations deletes them all.
- The site you're testing never sees them: the panel is TraceBug's own frame.
- Each time, the remembered repository and labels are checked against the lists the tracker returns now. One that's
  gone (removed, or no longer accessible) isn't selected: TraceBug falls back to your default repository and says so
  in one line ("owner/repo is no longer available, using your default …").

**In settings** (right-click the toolbar icon → Options; the only place on Firefox), open **Advanced: use a token**
on the tracker's card:

| Tracker | What to paste | Where to get it |
|---|---|---|
| **GitHub** | Personal access token: fine-grained with **Issues: Read and write** on the repos you want, or classic with `repo`. Default repository is optional. | github.com → Settings → Developer settings → Personal access tokens |
| **Linear** | Personal API key (under **Advanced: use a key**). Default team is optional. | Linear → Settings → API → Personal API keys |
| **Slack** | Incoming webhook URL | Slack → your app → Incoming Webhooks |

Saving asks the browser for access to that one tracker's API host. Then **Send to GitHub** (or Linear) opens the
same **Create an issue** window: tracker, a searchable **Repository** / **Team** picker listed from your account,
GitHub labels, assignee and milestone, and **Create issue**.

### The Create panel (in the ticket) and the Create window

On Chrome, **Send to GitHub** (or Linear) opens a small **Create a [GitHub ▾] issue** panel right inside the ticket,
above its buttons. It starts with your last repository, labels, assignee and milestone, so a repeat bug is one
click on **Create issue**; it then shows **Created #N** with a link, and the ticket stays open. The panel is an
extension frame: the site you're testing can't read what's in it (repository names, people, labels), and
**Create issue** only works after the panel has been fully on screen for half a second, not covered or faded,
and only for a real click or key press. Escape or **Cancel** closes it; closing the ticket or leaving the page
cancels it. If a site stops the panel from loading, the separate **Create** window opens instead. Firefox uses
the window.

The window:

- It shows the title and body exactly as they will be sent, with warnings (remote images, @mentions, a shortened body).
- Nothing is sent until you click **Create issue**; closing the window cancels. The window has no time limit:
  it stays open, with your choices, until you create or close it. Closing it leaves the ticket open in the page
  as it was (it is in the ticket list only if you saved it).
- If creating fails, the window keeps your choices, shows the error and offers **Retry**; your ticket in TraceBug
  is untouched. If the connection dropped, the tracker may have created the issue anyway, so Retry looks for it
  first and shows it instead of filing it twice:
  - **GitHub** has no way to make a create safe to repeat, so each issue ends with an invisible HTML comment
    holding a random id (nothing from your report). Retry lists the issues you opened in that repository since
    just before the first attempt, looks for that id, and checks again two seconds later before filing.
  - **Linear** lets TraceBug choose the new issue's id. TraceBug makes one random id per send, and Retry first
    asks Linear for an issue with that id.
- Only one Create per ticket runs at a time: a second click, or a second message, is refused while the first runs.
- If your sign-in expired or was revoked, the window shows **Reconnect GitHub** and keeps your choices.
- **Why not plain page UI:** the ticket runs inside the page you are testing, so anything drawn there by the page
  — your private repository names, teams, people — could be read by that site. The panel (a cross-origin
  extension frame) and the window both belong to the extension; the page only ever hands them the report text.
  Credentials live in the extension's own storage.
- GitHub's API can't attach files, so the recording and screenshots download when the issue is created; drag them
  into the issue (the body says which files).

**Coming next (Chrome first):** Connect for Azure DevOps and GitLab (a sign-in popup, no code), and Jira
Cloud with an API token. Firefox keeps the token path until the Firefox step.

**Slack** stays a webhook: the message is posted as it is, with no picker.

## In the npm SDK (page mode)

The SDK has no extension window, so it files straight from the page with the config you give it — your own app, your own token:

- **GitHub** → `POST /repos/{owner}/{repo}/issues`; the window shows the created issue's link. The full report body is sent (no URL truncation).
- **Linear** → GraphQL `issueCreate`. Opens the created issue; the toast shows its identifier (e.g. `ENG-42`).
- **Slack** → incoming-webhook POST. Fire-and-forget (Slack webhooks are CORS-opaque, so success is reported optimistically).

In page mode the config lives in that page's `localStorage` under `tracebug_integrations`. If a provider is **not** configured, the button falls back to the previous behavior (prefilled `/issues/new` URL for GitHub/Linear, copy-to-clipboard for Slack).

## For contributors: Linear sign-in from a dev build

Linear redirects its sign-in back to `https://<extension id>.chromiumapp.org/`, and only to URLs registered on the
Linear OAuth app. The dev `manifest.json` carries no store `key`, so an unpacked build has its **own** extension id.
Its redirect must be registered on the Linear app too, or Connect Linear fails with a redirect mismatch. Find the id on
`chrome://extensions` (Developer mode), or run `chrome.identity.getRedirectURL()` in the service worker console.
Each unpacked folder path gets a different id, so register the one you use. The store build's redirect
(`https://fdemmibikigigkfjngclmdheeajhdgaj.chromiumapp.org/`) is registered already. GitHub needs nothing here: its
device flow has no redirect.

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
