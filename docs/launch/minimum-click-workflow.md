# Minimum-click developer workflow — friction map (1.11.5)

Goal: **capture → fix → verify** with the fewest clicks, without reducing functionality or privacy.
Mapped 2026-11-03 from code (file:line below) plus first-hand evidence from recording the demo video
(`marketing/demo-video/`). Scope is five flows only; no redesign. Items marked *verified* were re-checked
in code after mapping.

**Status (2026-11-03): P0 and P1 are implemented for 1.11.6** (see CHANGELOG). P2 waits for evidence.

Already done, so **not** on this list: separate Tab / Desktop recording (Tab mode shipped in 1.11.3,
`tabCapture` required since 1.11.5 — no share picker on Chrome).

## The happy path today (Chrome, Claude Code, MCP already set up)

| # | Step | Clicks | Typing |
|---|------|-------:|--------|
| 1 | TraceBug icon → **Capture Bug** (Tab mode, no picker) | 2 | — |
| 2 | Reproduce the bug | — | — |
| 3 | **Stop** (HUD) → ticket modal opens itself | 1 | — |
| 4 | **Export replay (.html)** → lands in Downloads | 1 | — |
| 5 | Toast **Open in your AI agent →** copies the MCP prompt (optional) | 1 | — |
| 6 | Paste into Claude Code, or type `/tracebug:debug_bug_report` | — | 1 paste |

**4–5 clicks and one paste.** The core loop is already short. The friction is in first-time setup, in
places where the hand-off silently fails, and in verification, which is manual.

First run adds:
- installing and pinning (about 4 clicks);
- opening the playground (1);
- copying and running the `claude mcp add …` command (1 paste in a terminal);
- restarting the agent so it loads the server.

## Where it breaks (by flow)

**Flow 1: fresh install → first capture**
- The welcome page's MCP box copies a bare `npx tracebug mcp` (`tracebug-extension/welcome.html:515`).
  - Run alone, that command just waits on stdin; it's not a setup command.
- The welcome page and the popup hint call **Alt+B** "start a capture". It actually takes a screenshot and opens the ticket; it records nothing (`background.js:859-890`, `welcome.html:483`, `popup.js:1051`).
- Clicking the icon while still on the welcome tab gives "Can't run on this page". This is expected, but it's the first thing a curious user does.
- **Firefox:** there is no Tab mode, and new installs are seeded `video:true`. So the very first capture opens the share picker plus a recorder window (`popup.js:805`, `background.js:83-100`).

**Flow 2: existing install → capture**
- **The in-page toolbar's Record button always uses Desktop**, so Chrome shows the share picker, even though Tab mode exists. *Verified.*
  - The code comment explaining why (`src/compact-toolbar.ts:689-694`, `:729`) predates `tabCapture`.
- The popup's subtitle says "Records the tab" even in Desktop mode (`popup.js:787-789`).
- The static HTML pre-selects Desktop, then JS switches it to Tab, so the control flashes (`popup.html:217`).

**Flow 3: capture → report**
- **Stale "Restored draft" title.** On close, the modal saves the current title and description as a draft. Only Save Ticket, sending to a tracker, or Discard clear it. Export replay, HAR, zip, Copy GitHub and Fix with AI do not.
  - So the **next capture within an hour opens with the previous bug's title** and a "Restored draft" pill (`src/ui/quick-bug.ts:927`, clears at `:911,1077,1187,1689,2100`). *Verified; this happened on camera in the demo.*
- **Copy GitHub Issue** also auto-downloads every screenshot and the video (`quick-bug.ts:1094-1099`).
- The **More** menu has 11–12 flat items (T-04 still open).

**Flow 4: report → Claude Code / Cursor (MCP)**
- **`--dir ./bug-reports` breaks auto-discovery.** Without `--dir`, the server scans the project plus Downloads and Desktop. With it, `list_bug_reports` scans only that folder, so a report sitting in Downloads gives `count: 0` (`cli/mcp-server.ts:308-316`). *Verified.*
  - Yet `--dir ./bug-reports` is what the docs and copy texts recommend: `docs/mcp.md:6,9,71`, `packages/tracebug/README.md:14`, and the exported file's AI tab (`src/exporters/html-template.ts:1148`, which uses a literal `<reports-folder>` placeholder). *Verified.*
- The post-export hand-off link sits in a toast that **auto-dismisses after 8 s** (`quick-bug.ts:1334`). Miss it and the setup and prompt card is gone.
- `list_bug_reports` isn't sorted, so "the most recent report" isn't guaranteed (`mcp-server.ts:317`).
- **Fix with AI** builds the prompt **without the user's edited title and description**; Export does apply them (`quick-bug.ts:1586` vs `:1318-1323`).
- The **Cursor** setup string isn't valid JSON (it starts with "Add to .cursor/mcp.json:"). Windsurf has no tab (`quick-bug.ts:3719-3723`).
- **Docs:** `claude mcp add` is described as "global", but Claude Code's default scope is the project, so global needs `-s user`. A Windows `cmd /c npx` note is missing. *Both to be checked against the current Claude Code CLI before changing the docs.*

**Flow 5: investigation → fix → verify**
- **Red→green isn't automated.** `get_playwright_test` returns the spec text. Its `howToUse` doesn't mention installing `@playwright/test` and its browsers, or starting the dev server (the spec has no `webServer` block).
- `BASE_URL` defaults to the **captured** origin. A bug captured on staging tests staging, not the local fix (`exporters/playwright-test.ts:158-179`).
- The network assertion only checks "no ≥400 on this path". If the request is never sent, the test **passes falsely** (`playwright-test.ts:210-211`).
- When a session has no replayable actions, the MCP error wrongly blames a "pre-1.9 export" (`mcp-server.ts:455-459`).
- `resolve_stack` and `get_fix_context` need local `.map` files; this is expected, and the message already says so.

## Smallest changes, ranked (friction removed ÷ size)

**P0: things that silently fail or mislead (≈ half a day, one patch release)**
1. **Drop `--dir ./bug-reports` from the recommended commands.**
   - Where: `docs/mcp.md`, both READMEs, `src/reporters/playwright.ts:193`, and the exported AI tab (`html-template.ts:1148`).
   - Default to `claude mcp add tracebug -- npx -y tracebug mcp`, which already finds Downloads.
   - Text-only change.
2. **Clear the draft after a successful export or hand-off** (Export replay, HAR, zip, Copy GitHub, Fix with AI). Or only save a draft when it differs from the auto title and description. About 3 lines; kills the stale-title pill.
3. **Toolbar Record uses Tab mode when `tabCapture` is available**, reusing the popup's stored surface choice. Removes a share picker on every toolbar recording.
4. **Welcome page copies the real setup command** (`claude mcp add tracebug -- npx -y tracebug mcp`). Fix the Alt+B wording there and in the popup hint.

**P1: shorter hand-off (≈ 1 day)**
5. **Post-export hand-off stays until dismissed**: pass `autoDismissMs: null`, or open the card on the first export.
6. **`list_bug_reports` returns newest first** (sort by `generatedAt`). One line.
7. **Fix with AI applies the edited title and description**, as Export does.
8. **Cursor setup:** paste-ready JSON. Add a Windsurf tab.
9. **`get_playwright_test`:**
   - correct the no-actions error;
   - add to `howToUse` "`npm i -D @playwright/test && npx playwright install`; start your dev server; set `BASE_URL` to it".
10. **Copy fixes:**
    - the popup subtitle in Desktop mode;
    - the Tab/Desktop flash;
    - the AI tab's "localStorage" wording (keys live in `chrome.storage.local` in the extension);
    - the quickstart button labels.

**P2: bigger, only with evidence from observed users**
- A "Fix verified ✓" loop:
  - the spec gets a `webServer` / `BASE_URL` pointing at the local dev server;
  - the network assertion requires the request to happen;
  - the agent runs it red → green.
- Firefox: seed `video:false` when there's no `tabCapture`, so the first capture doesn't open a picker.
- Group the More menu (T-04). Stop Copy GitHub from auto-downloading files.

## Not doing (per the strategy)
- No new export formats, AI debugger, cloud dashboard, team workspace, annotations, integrations or redesign.
- Hosted sharing waits for user requests (paid tier = collaboration only, per the July pricing decision).

## Coverage gap
No end-to-end test drives a real toolbar-icon click, Tab-mode capture or mic grant
(`docs/audit/capture-flow-1.11.3.md:146`, `RELEASE_CHECKLIST.md:229-234`). P0 #3 needs a manual check in
Chrome, and P2's Firefox item needs `npm run ext:firefox`.
