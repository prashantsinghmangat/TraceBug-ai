# TraceBug 1.11.0 — store submission pack

## 1. Manifest name and description (decide before the final zip)

The Chrome Web Store shows the manifest `name` as the listing title and the manifest `description` as the summary. They can't differ from the listing, so the new title only appears if the manifest carries it.

### The two stores have DIFFERENT name limits

| Field | Chrome Web Store | Firefox AMO |
|---|---|---|
| `name` | 75 characters | **45 characters** |
| `short_name` | 12 recommended | 12 recommended |
| `description` | 132 characters | 132 characters |

**45 is the binding limit**, because one manifest feeds both builds. Exceed it and `npm run ext:lint`
fails with `JSON_INVALID "/name" must NOT have more than 45 characters` — AMO rejects the upload, while
Chrome accepts it happily, so a Chrome-only check will not catch this.

The first attempt at this rename used `TraceBug: Bug Report Recorder — Console, Network & Replay`
(57 chars). Valid for Chrome, rejected by AMO. Shortened rather than split per store, to keep one
identity across both listings.

### Shipped in 1.11.0

- `name`: `TraceBug: Bug Report Recorder & Replay` (38 characters — fits both)
- `short_name`: `TraceBug` (keeps the toolbar tooltip short)
- `description` (132 max): `Record a bug once: replay, console errors and network in one offline file. For QA and devs. Free, no account, no upload.` (120 characters)

Set them in both `manifest.base.json` and the dev `manifest.json` — `npm run check:versions` enforces
that the two agree on `name` and `description`, though **not** on `short_name`. Then rebuild with
`npm run zip:ext` and check `ext:lint` before uploading anywhere.

Note the base manifest stores non-ASCII raw (`—`) while the dev manifest escapes it (`—`). Keep
each file's convention or the diff becomes a whole-file re-encode.

## 2. Section 7b — permission justifications

| Permission | Justification |
|---|---|
| `activeTab` | Captures the bug on the tab where the user clicks TraceBug or presses the capture shortcut. |
| `scripting` | Injects the capture script into the current tab, only after the user starts a capture. |
| `storage` | Saves the user's settings, redaction rules and saved bug tickets on their own device. |
| `unlimitedStorage` | A report with an interactive DOM replay can exceed the default storage limit. It is stored only on the user's device. |
| `alarms` | Cancels an unanswered send-confirmation window after two minutes. |
| Optional host permissions | Requested only when the user wants a capture to continue across sites, or saves a GitHub, Linear, Slack, OpenAI, Anthropic or Ollama integration, so TraceBug can send the report the user approves to that service. |
| Remote code | No. All code ships in the package. |

`offscreen` is **not** requested in 1.11. It existed only to host screen
recording, which is paused in this release - so the permission is gone rather
than requested and unused. It returns with the feature in 1.11.1.

**Single purpose:** Capture a browser bug (replay, console errors, network requests) into a report the user can export or send to their own issue tracker.

## 3. Data-use disclosure (the judgement call)

Declare on the cautious side. TraceBug never sends data to its developer. But at the user's request it sends report content to GitHub, Linear, Slack or an AI provider, and it stores user-supplied API tokens. Declaring these categories costs nothing; leaving out one that a reviewer thinks applies can cause a rejection.

- ✅ **Website content:** page text, console and network data inside a capture.
- ✅ **User activity:** clicks, inputs and navigation recorded during a capture.
- ✅ **Authentication information:** API tokens the user enters, stored on their device and sent only to the service they chose.
- ✅ Tick all three certifications: not sold to third parties; not used for purposes unrelated to the single purpose; not used for creditworthiness or lending.
- Privacy policy URL: the existing one on tracebug.dev. Check that it says "nothing goes to TraceBug" and describes the user-initiated sends.

## 4. What's new in 1.11 (store description, top)

- No more "read and change all your data" warning: site access is asked for only when you need it.
- Video recording is paused while we finish it. It's back in 1.11.1.
- Tokens and API keys moved into TraceBug's own settings, and every GitHub, Linear or Slack send asks you first.
- If you set up GitHub, Linear, Slack or an AI key before 1.11, please revoke it and create a new one.
