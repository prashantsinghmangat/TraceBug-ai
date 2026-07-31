// ── Blog content layer ─────────────────────────────────────────────────────
// The ONLY module that knows where posts come from. Pages call getAllPosts()
// / getPostBySlug() and render — they never touch the storage.
//
// Today: posts live in the POSTS array below, content as markdown strings
// (headings ##, paragraphs, **bold**, `code`, ```fences```, [links](url)).
// Tomorrow: swap the function bodies for a fetch (Supabase table, CMS, MDX
// files — anything that returns this shape). Both functions are async NOW so
// that swap changes zero call sites.

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  /** ISO date, e.g. "2026-07-19" */
  date: string;
  readMinutes: number;
  tag: string;
  /** Hero image under /public — rendered above the post and used as its social card. */
  cover?: string;
  /** Markdown body — the storage format any future backend would use. */
  content: string;
}

const POSTS: BlogPost[] = [
  {
    slug: "how-to-write-a-bug-report-developers-actually-read",
    title: "How to write a bug report developers will actually read (template included)",
    description:
      "Most bug reports get bounced back with questions, not fixed. A working template, the five details that let a developer reproduce your bug on the first try, and the mistakes that get reports ignored.",
    date: "2026-07-19",
    readMinutes: 6,
    tag: "Bug reporting",
    cover: "/blog/bug-report-template/hero.png",
    content: `
Somewhere right now, a developer is reading a bug report that says "login doesn't work" and quietly moving it to the bottom of the pile. Not because they don't care — because there's nothing in it they can act on. No steps, no error, no environment. Fixing it starts with a round of questions, and the bug sits in limbo until the answers come back.

I've been on both sides of this. I've bounced vague reports back to testers, and I've written a few embarrassing ones myself. The difference between a report that gets fixed today and one that gets fixed next sprint is almost never the severity of the bug. It's whether the developer can **reproduce it on the first try**.

## What actually happens to your report

Here's the part nobody tells reporters: when a developer picks up your ticket, the first thing they do is try to make the bug happen on their machine. If they can, the fix is usually close. If they can't, everything stops. They'll ask you for steps, wait a day for your reply, try again, fail again because your staging account has different data than theirs, and by Friday the ticket has five comments and zero progress.

So the entire job of a bug report is this: get the developer to a reproduced bug in one attempt. Everything below serves that goal.

## The template

Copy this, fill it in, delete what you genuinely don't know:

\`\`\`
Title: [where] — [what broke] — [error, if you saw one]
  e.g. Checkout — "Place order" does nothing — TypeError in console

Steps (exact, from a known starting point):
1. Log in as a normal user (trial account)
2. Add any item to the cart
3. Apply coupon "SAVE20"
4. Click "Place order"

Expected: order confirmation page
Actual:   nothing visible happens; error appears in console

Console: paste the FULL error text here (not a screenshot of it)
Network: POST /api/orders → 404
Environment: Chrome 138, Windows 11, staging, trial account
How often: every time (3 of 3 tries)
\`\`\`

That last line matters more than people think. "Every time, 3 of 3" and "once, can't repeat it" are completely different bugs to a developer — one is a debugging session, the other is a stakeout.

![The anatomy of a bug report a developer can act on](/blog/bug-report-template/anatomy.webp)

## The five details that do the heavy lifting

**Numbered steps from a known starting point.** "Go to checkout" hides ten decisions — logged in as whom, cart containing what, arrived from which page. Start from somewhere the developer can also start from, and number every click. If a step involves typed input, include the exact text; "SAVE20" versus "save20" has been the entire bug more than once.

**Expected versus actual.** Two short lines. This is the fastest way to expose the bugs that turn out to be misunderstandings — sometimes the answer is "that's intended behavior," and it's much cheaper to learn that in triage than after an hour of code archaeology.

**The console error as text.** Not a screenshot of the text. A screenshot can't be copied into a code search, gets blurry, and always seems to crop the one line that matters — the stack frame pointing at the file. Right-click the error in the console, copy, paste the whole red block.

**The failing request.** If the Network tab shows anything red, the method, path, and status code — \`POST /api/orders → 404\` — is often the diagnosis. Half of all "button does nothing" bugs are a request failing silently behind the button.

**Environment.** Browser and version, OS, which deployment (production? staging?), and what kind of account. Bugs that "only happen for trial users on staging" are described by exactly those words.

## The mistakes that get reports bounced

A title like "app broken" or "URGENT!!!" tells the developer nothing and reads as noise. "Sometimes it fails" without a count reads as "I tried once." Three bugs stuffed into one report guarantees two of them get lost when the ticket closes. And writing the report tomorrow from memory produces steps that don't reproduce — if you can't file it now, at least paste the console error somewhere now.

## The honest shortcut

Everything above is transcription work: you watching a browser and writing down what it did. Humans are slow and unreliable at this, which is why the average bug report takes twenty minutes to write and still comes back with questions.

The alternative is capturing instead of describing. [TraceBug](https://tracebug.dev) is a free extension that records what actually happened — the session replay, every console error with its stack trace, every network request, and a millisecond timeline of your clicks — into one \`.html\` file that opens offline. The report above, the one with the coupon and the 404? A real capture of it is [what an AI agent debugged in five tool calls](/proof), no human explanation attached.

Try it on a fake bug first: the [live sandbox](https://tracebug.dev/try.html) has two intentional ones waiting. Total cost of a perfect report: two clicks.
`.trim(),
  },
  {
    slug: "what-is-session-replay",
    title: "What is session replay? (It's not a screen recording)",
    description:
      "Session replay records the DOM, not pixels — that's why a replay is a few hundred kilobytes, lines up with your console and network logs to the millisecond, and can mask passwords before they're ever stored.",
    date: "2026-07-19",
    readMinutes: 5,
    tag: "Under the hood",
    cover: "/blog/session-replay/hero.png",
    content: `
"Session replay" sounds like someone screen-recorded the user. It isn't, and the difference is the whole reason the technique works.

A video of a browser is pixels: megabytes per minute, un-inspectable, and whatever was on screen — passwords included — is burned in forever. A session replay is **data**: a snapshot of the page's DOM plus a timestamped stream of every mutation, click, scroll, and input that followed. To watch it, a player rebuilds the page and re-applies those events in order. You're not watching a film of the bug. You're watching the bug's DOM happen again.

The open-source engine behind most of this — including TraceBug — is [rrweb](https://github.com/rrweb-io/rrweb), which has quietly become the standard way to serialize what a browser session did.

![A screen recording stores pixels; a session replay stores DOM events with timestamps](/blog/session-replay/dom-vs-video.webp)

## Why data beats video

**Size.** DOM events compress absurdly well. A minute of interaction that would be a 50 MB screen recording is typically a few hundred kilobytes gzipped. Small enough to attach to a ticket, email, or Slack message like a normal file.

**Precision.** Every event carries a millisecond timestamp. That means the replay can be lined up exactly against the console log and the network log: the user clicked "Place order" at 00:00.44, and the POST failed at 00:00.46. Video gives you "somewhere around the middle, I think."

**Inspectability.** Because the replay is a real DOM, you can pause it and look at the actual state of the page — what class that button had, whether the form value was really set. Try pausing a video and asking it what's inside an element.

**Privacy by construction.** A recorder that works at the DOM level can mask input fields *at capture time* — the password is replaced before it's ever written to the event stream. A video can't unsee what was on screen; the pixels either got recorded or they didn't.

## The honest catch

DOM recording has edges. Canvas and WebGL render outside the DOM, so a game or a chart library that paints to canvas replays as a blank box or a sparse snapshot. Cross-origin iframes are sealed off by the browser itself. And a replay shows what the client did — it's evidence about the frontend, not proof of what your server was thinking. For most web app bugs none of this matters; for the exceptions, the console and network logs riding alongside the replay carry the diagnosis anyway.

## Where replay fits in a bug report

A replay on its own answers one question: *what did the user actually do?* That's the question people answer worst from memory — nobody remembers that they double-clicked, or that they edited the coupon field twice. But the full picture needs three streams: the replay (what they did), the console (what broke), and the network (what failed). The value is in the correlation — same timeline, three witnesses.

That's the design behind [TraceBug](https://tracebug.dev)'s export: one self-contained \`.html\` file holding all three, gzip-compressed, viewable offline in any browser with no player to install and no account to make. Nothing is uploaded anywhere — the capture happens in your browser and lands on your disk, which for session data isn't a feature so much as a requirement.

## See one instead of reading about one

The [live sandbox](https://tracebug.dev/try.html) has intentional bugs. Trigger one, capture it, open the export — the replay, console, and timeline are all in the file. If you want to see what a machine makes of that evidence, [an AI agent debugged one of these captures in five tool calls](/proof), unedited.
`.trim(),
  },
  {
    slug: "mcp-server-example-bug-reports",
    title: "A practical MCP server example: let Claude read bug reports from your disk",
    description:
      "A concrete Model Context Protocol example you can run in one command: a local, stdio-only MCP server that gives Claude Code, Cursor, or Windsurf read tools over exported bug reports — with a real transcript of the result.",
    date: "2026-07-19",
    readMinutes: 5,
    tag: "AI debugging",
    cover: "/blog/mcp-example/hero.png",
    content: `
Most MCP explainers stop at the elevator pitch — "it's a standard way to give AI models tools" — and then show you a weather API. Accurate, but it doesn't tell you what MCP feels like when it's actually useful. Here's a concrete example you can run in one command, doing a job that's genuinely annoying without it: getting a browser bug's evidence into a coding agent.

## The problem it solves

When a bug happens in a browser, the evidence is scattered: an error in the console, a failed request in the network tab, a sequence of clicks nobody wrote down. The usual way this reaches Claude or Cursor is you, copy-pasting fragments into chat — losing the stack trace's formatting, forgetting the request that failed, summarizing the steps from memory. The agent reasons about your paraphrase instead of the bug.

[TraceBug](https://tracebug.dev) captures all of that into a single \`.html\` file on your disk. The MCP server is the missing bridge: it lets the agent read those files itself.

## What the server actually is

One process, launched by your agent, speaking MCP over stdio:

\`\`\`
npx -y tracebug mcp
\`\`\`

There's no daemon, no port, no account, and — worth saying explicitly — no network. The server opens zero connections; it reads report files from your disk and answers the agent through stdin/stdout. When the agent session ends, the process dies. By default it auto-discovers exports in your Downloads and Desktop folders; \`--dir ./bug-reports\` pins it to a project folder instead.

![The whole pipeline is local: agent ↔ MCP server ↔ bug-report files on your disk](/blog/mcp-example/architecture.webp)

## The tools the agent gets

Six read-only tools. \`list_bug_reports\` finds every export and returns titles and summaries. \`get_bug_report\` returns one report's full evidence along with a prioritized investigation guide — which errors to look at first, which requests failed. Then \`get_console_errors\`, \`get_network_activity\`, \`get_repro_steps\`, and \`get_screenshot\` let it drill into each stream. Read-only matters: the agent can investigate anything and break nothing.

## What it looks like in practice

We published [the unedited transcript](/proof) of a real session: Claude starts knowing only that a report exists somewhere, calls \`list_bug_reports\`, pulls the report, reads the console errors and the network log, and lands on the root cause — a coupon code missing from a lookup object, crashing a \`.discount\` property read — in **five tool calls**. Nobody explained the bug to it. The evidence was enough.

## Hook it into your agent

Each tool wants the config in a slightly different place, so there's a short page per tool: [Claude Code](/docs/mcp/claude-code) (one CLI command), [Cursor](/docs/mcp/cursor) (a JSON file in \`.cursor/\`), and [Windsurf](/docs/mcp/windsurf) (Cascade's MCP config). All three boil down to "run \`npx -y tracebug mcp\` for me."

## If you're building your own MCP server

Steal the shape, not the code: **local files in, read-only tools out** is the friendliest first MCP pattern there is. No auth to design, no side effects to fear, no state to corrupt — and the agent gets superpowers over data it previously couldn't see at all. The hard part of agent context isn't transport, it's having evidence worth reading. Capture that well and the MCP part is almost boring.
`.trim(),
  },
  {
    slug: "give-your-ai-agent-the-bug",
    title: "Stop pasting screenshots into Claude — give your AI agent the actual bug",
    description:
      "AI coding agents are only as good as their evidence. How to hand Claude Code, Cursor, or Windsurf a complete bug report — replay, console, network, repro steps — through a local MCP server, in two minutes.",
    date: "2026-07-19",
    readMinutes: 6,
    tag: "AI debugging",
    cover: "/blog/agent-evidence/hero.png",
    content: `
AI coding agents are only as good as their evidence. Paste a screenshot of a broken checkout into a chat and the model gets pixels: no stack trace, no failing request, no idea what the user clicked. It will guess — confidently — and you'll spend the next twenty minutes correcting the guesses.

The fix isn't a smarter prompt. It's better evidence. Here's the two-minute setup that hands Claude Code, Cursor, or Windsurf everything a human debugger would want: the session replay, console errors with stack traces, failed network requests, and a millisecond-resolution timeline of what the user actually did.

## Step 1 — Capture the bug (2 clicks)

Install the [TraceBug extension](https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj) (free, no account) or add \`tracebug-sdk\` to your app. When a bug happens: start a capture, reproduce it, click capture. TraceBug records the DOM session, console, and network locally — nothing is uploaded anywhere.

## Step 2 — Export one file

Click **Export .html**. You get a single self-contained file — replay, errors, requests, timeline, environment — that opens offline in any browser. Typically under a megabyte thanks to gzip-compressed DOM events.

## Step 3 — Register the MCP server (once, ever)

\`\`\`
claude mcp add tracebug -- npx -y tracebug mcp
\`\`\`

That's the whole setup. The server runs locally and auto-discovers exports in your Downloads and Desktop folders — no paths to configure. Cursor and VS Code users: the hand-off card in TraceBug shows the equivalent one-liner for each tool.

## What the agent can do now

Your agent gets five tools: \`list_bug_reports\`, \`get_bug_report\` (which includes a prioritized investigation guide), \`get_console_errors\`, \`get_network_activity\`, and \`get_repro_steps\`. It reads the evidence, cross-references your codebase, and starts from the actual failing line instead of a guess.

We ran this exact flow and published the unedited transcript: **five tool calls from crash to root cause**, including the stack trace that named the file and line, and the diagnosis that followed. [Read the real transcript →](/proof)

## No MCP? There's a chat path too

If you just want to paste into a chat window, don't upload the replay file — it's built for browsers and MCP, not context windows. Use **AI report (.html)** or **Download report (.md)** from the More menu instead: a few KB of structured plain text that fits any model's context.

## Why local matters

The whole pipeline — capture, export, MCP server — runs on your machine. Bug reports contain your app's DOM, your network payloads, your users' sessions. With TraceBug that evidence goes from your browser to your disk to your agent, and nowhere else. It's MIT-licensed open source; audit it.
`.trim(),
  },
  {
    slug: "jam-dev-alternatives",
    title: "7 Jam.dev alternatives for bug reporting in 2026 (an honest comparison)",
    description:
      "Jam is a great tool — but it's not the only way to capture browser bugs. A frank tour of BetterBugs, Bird Eats Bug, Marker.io, BugHerd, Userback, Replay.io, and TraceBug: what each is actually for, and when to pick it.",
    date: "2026-07-30",
    readMinutes: 9,
    tag: "Comparisons",
    cover: "/blog/jam-alternatives/hero.jpg",
    content: `
Full disclosure before anything else: I build [TraceBug](https://tracebug.dev), which appears on this list. I'll declare the bias, keep the claims checkable, and tell you when a competitor is genuinely the better pick — because recommending the wrong tool to keep you on my site would be a bad trade for both of us.

Jam.dev earned its popularity honestly. One click, and a bug report with console, network, and a replay lands in a shareable link. If you're evaluating alternatives, it's usually for one of four reasons: **price** (per-seat cloud tools add up), **privacy** (your bug captures contain your app's data, and they're on someone else's servers), **workflow fit** (you want the bug to land in front of an AI coding agent, not a dashboard), or **audience** (your reporters are clients, not QA engineers). Different reasons point at different tools — so instead of a feature table that flattens everything, here's what each tool is actually *for*.

## 1. TraceBug — when the bug's next stop is an AI coding agent

Mine, so judge accordingly. TraceBug captures the same evidence class as Jam — DOM replay, console errors, network requests, screenshots, screen recording — but packages it as **one self-contained .html file on your machine** instead of a cloud link. No account, no upload, no telemetry.

The reason it exists: the bug report's most important reader in 2026 often isn't a human. TraceBug ships a local MCP server (\`npx tracebug mcp\`) so Claude Code, Cursor, or Windsurf can read the full report — replay included — and start fixing. Every report also embeds a **generated failing Playwright test** that goes green when the bug is actually fixed.

![The TraceBug ticket, captured in Firefox — auto-titled with root cause, console, and the failing request](/blog/jam-alternatives/ticket-modal.jpg)

**Pick TraceBug when:** you (or your team) debug with AI agents, you can't ship session data to a third-party cloud, or you want the whole workflow free and open source (MIT).
**Pick something else when:** you need hosted team links and cross-device history today — TraceBug's reports are files you share yourself. ([Full comparison →](/compare/jam-alternative))

## 2. BetterBugs — when you want Jam's model with more capture knobs

BetterBugs is the closest like-for-like Jam alternative: browser extension, cloud workspace, console + network + replay attached to every report, Slack and Jira routing. Its capture options are discoverable and QA-friendly, and teams that live in a shared workspace get exactly that.

**Pick BetterBugs when:** you want the Jam workflow with a different price/feature mix and a hosted team space.
**Pick something else when:** privacy or local-first matters — captures live in their cloud, and sharing needs an account. ([TraceBug vs BetterBugs →](/compare/betterbugs-alternative))

## 3. Bird Eats Bug — when instant replay for non-engineers is the point

Bird Eats Bug pioneered the "your recording already includes the technical data" pitch, and it's still excellent at it. Support and success teams who'd never open DevTools produce reports engineers can act on.

**Pick Bird when:** your reporters are non-technical and a hosted link is how your org shares.
**Pick something else when:** you want the evidence to stay local, or you want the report to feed an agent + a failing test rather than a viewer. ([TraceBug vs Bird Eats Bug →](/compare/bird-eats-bug-alternative))

## 4. Marker.io — when your reporters are clients, not colleagues

Marker.io is really a **client-feedback router** for agencies: reviewers annotate the live site, feedback lands in your PM tool, and status updates flow back to the reporter without them ever seeing Jira. That two-way loop is the product, and nothing else here does it as well.

**Pick Marker.io when:** agencies + client review cycles describe your life.
**Pick something else when:** you need deep technical evidence — an annotated screenshot won't tell your developer (or your agent) which request failed. ([TraceBug vs Marker.io →](/compare/marker-io-alternative))

## 5. BugHerd — when feedback should be pinned to the page like sticky notes

BugHerd's model is spatial: reporters click the broken element, the note pins to it, and everything flows into a kanban board. For visual QA on websites — especially with guest reporters — it's delightfully simple.

**Pick BugHerd when:** the task board *is* your triage process and reporters are non-technical.
**Pick something else when:** the bug is behavioral rather than visual — you'll want the console and network story, not a pin. ([TraceBug vs BugHerd →](/compare/bugherd-alternative))

## 6. Userback — when you're collecting feedback, not just bugs

Userback has grown into a full feedback platform: surveys, feature requests, roadmaps, portals where end users track what they asked for. Bug capture is one feature among many.

**Pick Userback when:** you want one place for *all* user sentiment, of which bugs are a slice.
**Pick something else when:** you specifically need developer-grade bug evidence — that's a different job. ([TraceBug vs Userback →](/compare/userback-alternative))

## 7. Replay.io — when the bug is so gnarly you need time travel

Replay.io is the deepest tool on this list and the least comparable: it records the entire JavaScript runtime, so you can inspect any variable at any point in time, after the fact. For the once-a-quarter impossible bug, nothing else comes close.

**Pick Replay.io when:** you're a developer chasing a non-reproducible runtime bug and you're willing to record in their browser.
**Pick something else when:** you need everyday, twenty-second captures QA can do on any site. ([TraceBug vs Replay.io →](/compare/replay-io-alternative))

## The one question that picks your tool

Ask where the bug report's journey **ends**:

- In a **PM tool, reported by clients** → Marker.io or BugHerd
- In a **team dashboard, shared by link** → Jam, BetterBugs, or Bird Eats Bug
- In a **feedback backlog next to feature requests** → Userback
- In a **time-travel debugging session** → Replay.io
- In front of a **developer or an AI coding agent, with everything needed to fix it** → TraceBug

![After export, TraceBug hands the report straight to Claude Code or Cursor over MCP](/blog/jam-alternatives/ai-handoff.jpg)

If that last line is you, the fastest way to check is not this article: [try the live sandbox](https://tracebug.dev/try.html) — a page with intentional bugs and the real widget running. Capture one, export the .html, and drop it in front of your agent. The whole loop takes under two minutes, costs nothing, and nothing you capture leaves your machine.
`.trim(),
  },
  {
    slug: "give-claude-code-browser-context",
    title: "How to give Claude Code full browser context for a bug (stop typing 300-word descriptions)",
    description:
      "Claude Code can't see your browser. When a UI bug happens, you become its eyes — badly. What coding agents actually need to fix a browser bug, how to assemble it by hand, and how to capture all of it in one click.",
    date: "2026-07-31",
    readMinutes: 7,
    tag: "AI debugging",
    cover: "/blog/claude-code-context/hero.jpg",
    content: `
Here's a loop every Claude Code and Cursor user knows by heart. A button in your app stops working. You open the agent and type: *"When I click Place Order on checkout, nothing happens. Sometimes there's an error in the console. Can you fix it?"*

The agent — which is genuinely good at code — starts guessing. It greps for the button handler. It asks what the console said. You alt-tab, reproduce the bug, squint at the console, paraphrase the error. It asks about the network tab. Another alt-tab. Fifteen minutes in, you're the world's slowest JSON API between your browser and your agent, and the agent still has a foggy, secondhand picture of what happened.

The problem isn't the agent. **The problem is that your agent can't see the browser.** Everything it knows about the bug arrives through your typing.

## What an agent actually needs

When a human debugs a browser bug, they look at five things almost immediately. Your agent needs exactly the same five — it just can't gather them itself:

1. **The console error, verbatim** — the full text with the stack, not "there was a TypeError somewhere."
2. **The network story** — which request fired, with what payload, and what came back. Half of all "frontend" bugs are a failing API call wearing a UI costume.
3. **The exact action sequence** — what was clicked, in what order, with what typed input. "I clicked around and it broke" is not reproducible.
4. **The DOM state** — what the page actually looked like when it broke, not what the JSX says it should look like.
5. **The environment** — browser, viewport, URL, and route. "Works on my machine" lives in this gap.

Give an agent those five things and something remarkable happens: it stops guessing. It reads the failing request, finds the handler, connects the console stack to a file and line, and proposes a fix grounded in what *actually happened* — usually on the first try.

## The manual way (works today, costs ~10 minutes per bug)

You can assemble this by hand, and if you do nothing else, this checklist will improve your agent sessions immediately:

\`\`\`
1. Reproduce the bug with DevTools open
2. Console tab → right-click the error → Copy → paste as text (never a screenshot)
3. Network tab → find the failing request → Copy → Copy as cURL, plus the response body
4. Write the exact steps: numbered, from a known starting point, with typed values
5. Note browser + URL + viewport
6. Paste all of it into the agent in one message
\`\`\`

This works. It's also ten minutes of secretarial work per bug, you'll skip it when you're in a hurry, and the one detail you omit is reliably the one that mattered.

## The one-click way

This is the exact problem [TraceBug](https://tracebug.dev) exists to solve (disclosure: I build it). The browser extension captures all five evidence types as the bug happens — DOM replay, console, network, action timeline, environment — and packages them into one self-contained \`.html\` file on your machine. Nothing uploads anywhere.

![The captured ticket: auto-titled with the failing request, console, network, and repro timeline attached](/blog/claude-code-context/ticket.jpg)

Then the hand-off, which is the part built specifically for agents: TraceBug ships a local MCP server —

\`\`\`
claude mcp add tracebug -- npx -y tracebug mcp
\`\`\`

— and after that, Claude Code reads the report *directly*. Not a summary you typed: the actual console errors, the actual failed request with its response body, the repro steps, resolved stack frames when source maps are available. One MCP tool, \`get_fix_context\`, hands the agent a fix-starter in a single call: the failing request, the user action that triggered it, and the first error with its top frames.

There's a verification step too: every report embeds a **generated failing Playwright test**. The agent runs it (red), patches the code, runs it again (green). The fix isn't "looks plausible" — it's proven against the captured failure. ([More on that here](/blog/failing-playwright-test-from-bug-report).)

If you use chat instead of an agent — claude.ai, ChatGPT — don't upload the replay file; it's built for browsers and MCP, not context windows. TraceBug's **AI report (.html)** export is a few KB of structured plain text made exactly for pasting into a chat.

## Try the loop in two minutes

The [live sandbox](https://tracebug.dev/try.html) has a checkout page with intentional bugs and the real widget running. Capture one, export it, and hand it to your agent. The first time Claude fixes a bug from evidence it gathered itself — no typing, no alt-tabbing, no paraphrased stack traces — the 300-word bug description era ends on the spot.
`.trim(),
  },
  {
    slug: "failing-playwright-test-from-bug-report",
    title: "Turn a bug report into a failing Playwright test — automatically",
    description:
      "A bug report tells you something broke. A failing test proves when it's fixed. How TraceBug generates a runnable Playwright spec from a captured browser session — red while the bug exists, green after the fix — and why that changes AI-assisted debugging.",
    date: "2026-07-31",
    readMinutes: 6,
    tag: "Playwright",
    cover: "/blog/playwright-from-bug/hero.jpg",
    content: `
Every bug fix ends with the same slightly awkward question: *how do we know it's actually fixed?* Usually the answer is "the person who reported it clicked around again and it seemed fine." That's a vibe, not a verification — and with AI agents writing more of our fixes, vibes are not enough. An agent will happily declare victory on a patch that compiles.

There's an old discipline for this: **write a failing test first.** Reproduce the bug as an assertion, watch it fail, fix the code, watch it pass. Almost nobody does it for reported bugs, because translating "the order button doesn't work" into a runnable test is twenty minutes of tedious locator archaeology.

So [TraceBug](https://tracebug.dev) does the translation automatically (disclosure: I build it). Every captured bug report embeds a generated Playwright spec that replays the session and asserts the captured failure is gone.

## What the generated test contains

TraceBug already captured everything a test needs: the exact click/input sequence, the request that failed, the console error that fired. The generator turns that into a spec:

\`\`\`ts
import { test, expect } from '@playwright/test';

// Captured with TraceBug — free, local-first bug reports
// Generated from bug report: "Place order" Action — API POST Returns 404
//
// This test REPRODUCES the captured bug — expect it to FAIL until the bug
// is fixed, then pass. Point BASE_URL at your running dev server.

test('replays the captured session and asserts the failure is gone', async ({ page }) => {
  // ...navigates to the captured route, replays each action in order,
  // then asserts:
  //  - the captured endpoint (POST /api/orders) no longer fails
  //  - the captured console error is no longer thrown
});
\`\`\`

Three details in the generation matter more than they look:

**Locator preference is stability-ordered.** Each replayed action targets \`data-testid\` first, then \`id\`, then \`aria-label\`, then role + accessible name, and only falls back to the captured CSS selector last — so the test survives a refactor better than a recorded macro would.

**The assertions target the captured failure, not a screenshot.** The spec collects failed requests and asserts *the specific endpoint that broke* stops failing, and that the captured console error stops being thrown. It's asserting the bug, not the pixels.

**Redacted input stays redacted.** If the captured session involved sensitive typed values, they arrive in the test as \`TODO\` placeholders with a comment — the capture-time masking carries through to the artifact.

## Why this is bigger with an AI agent in the loop

Hand an agent a bug report and a failing test together, and the debugging session gets a *definition of done*:

1. Agent reads the report over MCP (console, network, replay — [the full-context story](/blog/give-claude-code-browser-context))
2. Agent runs the spec → **red**, reproducing the exact captured failure
3. Agent patches the code
4. Agent runs the spec → **green**

Step 4 is the difference between "the agent says it's fixed" and "the fix is proven against the failure that was actually captured." It also leaves something behind: commit the spec, and this bug has a permanent regression guard in CI. The bug report stops being a disposable artifact and becomes part of the test suite.

## Getting one

Three ways, all free: the **Download failing test (.spec.ts)** item in the ticket's More menu, embedded inside every exported \`.html\` replay, or via the MCP tool \`get_playwright_test\` if your agent wants to fetch it itself. Run it like any spec:

\`\`\`
npx playwright test bug-place-order-404.spec.ts
\`\`\`

The fastest way to see the loop end-to-end: capture a bug on the [live sandbox](https://tracebug.dev/try.html) — it has intentional bugs for exactly this — export the test, and watch it fail for the right reason. Then fix the sandbox's bug if you like. The test will tell you when you're done, which is more than most bug reports ever did.
`.trim(),
  },
  {
    slug: "betterbugs-alternatives",
    title: "6 BetterBugs alternatives for bug capture in 2026 (picked by workflow, not features)",
    description:
      "BetterBugs is a capable Jam-style capture tool — but the right alternative depends on where your bug reports end up: a team dashboard, a client's PM tool, or an AI coding agent. An honest tour of Jam, Bird Eats Bug, Marker.io, BugHerd, Userback, and TraceBug.",
    date: "2026-07-30",
    readMinutes: 7,
    tag: "Comparisons",
    cover: "/blog/betterbugs-alternatives/hero.jpg",
    content: `
Disclosure first: I build [TraceBug](https://tracebug.dev), which is on this list. Bias declared; claims kept checkable; each tool gets an honest "pick it when."

BetterBugs sits in the same family as Jam.dev: a browser extension that captures screenshots and recordings with console and network logs attached, feeding a cloud workspace with Slack and Jira routing. If it's not quite fitting, the useful question isn't "what has more features" — it's **where do your bug reports end up?** Different destinations, different winners.

## 1. Jam.dev — the category's default

The most polished version of the capture-to-cloud-link workflow, with a mature extension and broad integrations. If you're leaving BetterBugs but staying in the same model — hosted links, team workspace — Jam is the obvious candidate. Trade-offs are the model's, not the product's: captures live in their cloud, and the free tier has limits. ([I've written a full tour of the Jam alternatives here](/blog/jam-dev-alternatives).)

**Pick Jam when:** you want the smoothest hosted capture-and-share loop.

## 2. TraceBug — when the report's destination is an AI coding agent

Mine. Same evidence class — DOM replay, console, network, screenshots, screen recording — but the output is **one self-contained .html file on your machine**, not a cloud link. No account, no upload, free and open source (MIT).

The differentiators are about what happens *after* capture: a local MCP server lets Claude Code or Cursor read the report directly and start fixing, and every report embeds a [generated failing Playwright test](/blog/failing-playwright-test-from-bug-report) that proves the fix. If your bugs end up in front of an agent — or your compliance posture can't accept session data on third-party servers — this is the fit. If you need hosted team links today, it isn't (yet): reports are files you share yourself. ([Full comparison →](/compare/betterbugs-alternative))

**Pick TraceBug when:** AI-agent debugging or local-first privacy is the point.

## 3. Bird Eats Bug — when non-engineers do the reporting

The friendliest capture flow for support and success teams: hit record, and the technical data rides along invisibly. Reports arrive as hosted links engineers can actually act on. Cloud-based, per-seat. ([Comparison →](/compare/bird-eats-bug-alternative))

**Pick Bird when:** your reporters would never open DevTools and hosted links are how your org shares.

## 4. Marker.io — when reporters are clients

A different job entirely: website feedback from *clients* routed into your PM tool, with status flowing back to them automatically. Agencies live on this loop. It won't give a developer (or an agent) deep technical evidence — that's not its job. ([Comparison →](/compare/marker-io-alternative))

**Pick Marker.io when:** agency + client review cycles describe your week.

## 5. BugHerd — when feedback belongs pinned to the page

Reporters click the broken element; the note pins to it; everything lands on a kanban board. Wonderfully simple for visual QA with guest reporters. Behavioral bugs — where the story is in the console and network — need a different tool. ([Comparison →](/compare/bugherd-alternative))

**Pick BugHerd when:** the task board is your triage process.

## 6. Userback — when bugs are one slice of all feedback

A full feedback platform — surveys, feature requests, roadmaps, user portals — where bug capture is one feature among many. If you want a single system for everything users tell you, that breadth is the appeal; if you want developer-grade bug evidence, it's the compromise. ([Comparison →](/compare/userback-alternative))

**Pick Userback when:** you're consolidating all user sentiment in one place.

## The routing table

- Reports end in a **hosted team workspace** → Jam or Bird Eats Bug
- Reports come **from clients into your PM tool** → Marker.io or BugHerd
- Reports live **next to feature requests and surveys** → Userback
- Reports land **in front of a developer or AI agent with everything needed to fix them** → [TraceBug](https://tracebug.dev/try.html)

Whichever you pick, insist on one thing: the report must let its reader reproduce the bug on the first try. That property — not the logo on the tool — is what gets bugs fixed.
`.trim(),
  },
  {
    slug: "report-bugs-to-cursor",
    title: "How to report bugs to Cursor so it fixes them on the first try",
    description:
      "Cursor is brilliant at code and blind to your browser. The difference between a five-round guessing session and a first-try fix is what you paste into that first message. Here's what works — manually, and with one click.",
    date: "2026-08-01",
    readMinutes: 6,
    tag: "AI debugging",
    cover: "/blog/report-bugs-to-cursor/hero.jpg",
    content: `
Cursor has read your entire repo. It knows your components, your API routes, your naming conventions. And the moment a browser bug appears, all of that goes to waste — because the one thing Cursor *can't* read is what just happened in your browser.

So the session starts like this: *"the checkout button is broken."* Cursor, blind, does the only thing it can: pattern-matches on your code. It finds three plausible suspects, rewrites one, and asks you to try again. It's not hallucinating out of malice — it's debugging with no evidence, which is what we'd call guessing if a human did it.

## The first message decides the whole session

There's a sharp asymmetry in agent debugging sessions: **context added in the first message is worth five times the same context added in message six.** By message six, the agent has already committed to a theory and generated code around it. Front-load the evidence and the theory forms around reality instead.

For a browser bug, the first message needs five things — the same five a human debugger checks first:

- the console error, **as text, with the stack**
- the network request that failed, with its response body
- the exact click/input sequence that triggered it
- what the DOM actually showed
- browser, URL, and route

## The manual version

Paste this shape into Cursor and watch the difference:

\`\`\`
Bug: clicking "Place order" does nothing on /checkout

Steps: logged in → added item → applied coupon "SAVE20" → clicked Place order
Console: TypeError: Cannot read properties of undefined (reading 'status')
         at OrderSummary (OrderSummary.tsx:42)
Network: POST /api/orders → 404 (response: {"error":"route not found"})
Env: Chrome 150, /checkout?step=payment, viewport 1280x800
\`\`\`

With that, Cursor doesn't grep-and-guess. It goes to \`OrderSummary.tsx:42\`, sees the code expects a response the 404 never delivered, and fixes both the missing route handling and the unguarded property access. First try. The evidence did the aiming; the agent did the coding.

## The one-click version

Assembling that block by hand takes ten minutes you won't spend when it's the fourth bug of the day. [TraceBug](https://tracebug.dev) (disclosure: I build it) captures all five evidence types automatically — DOM replay, console, network, action timeline, environment — into one local \`.html\` file, and hands it to Cursor through a local MCP server:

\`\`\`
Add to .cursor/mcp.json:
{"mcpServers":{"tracebug":{"command":"npx","args":["-y","tracebug","mcp"]}}}
\`\`\`

![After export, the hand-off card gives you the exact prompt to paste into Cursor](/blog/report-bugs-to-cursor/handoff.jpg)

From then on the workflow is: capture the bug → export → paste the generated one-line prompt into Cursor. The agent calls \`get_bug_report\` and \`get_fix_context\` itself and reads the *actual* evidence — not your summary of it. Nothing uploads anywhere; the MCP server reads the file from your own disk.

Two extras that specifically suit Cursor's strengths: the report resolves minified stack frames through your source maps when available, so the agent lands on real files and lines — and it embeds a [generated failing Playwright test](/blog/failing-playwright-test-from-bug-report), so Cursor can prove the fix instead of asserting it.

## Try it on a real bug

The [live sandbox](https://tracebug.dev/try.html) has intentional bugs and the real capture widget. Break the checkout, capture it, hand the file to Cursor, and compare the session to your last "the button is broken" conversation. More on the general pattern: [how to give Claude Code full browser context](/blog/give-claude-code-browser-context) — everything there applies to Cursor identically.
`.trim(),
  },
  {
    slug: "debug-react-bugs-with-ai",
    title: "Debugging React bugs with AI: why your agent guesses, and how to make it stop",
    description:
      "React's most common bugs — undefined props, stale state, effects firing at the wrong time — are exactly the ones AI agents struggle to fix from a description alone. What each bug class needs as evidence, and how to capture it.",
    date: "2026-08-01",
    readMinutes: 7,
    tag: "React",
    cover: "/blog/debug-react-bugs-with-ai/hero.jpg",
    content: `
Ask an AI agent to fix a React bug from a one-line description and you'll usually get a very confident rewrite of the wrong thing. Not because the model is bad at React — it's arguably better-read in React than any of us — but because React's most common bugs are *runtime* bugs, and the agent only sees your *code*.

The gap between "what the code says" and "what actually happened at runtime" is precisely where React bugs live. Here are the four classes that dominate real apps, and what each one needs as evidence before an agent can fix it rather than guess at it.

## 1. The undefined-property TypeError

*"Cannot read properties of undefined (reading 'status')"* — the most common React crash in existence. The code renders \`order.status\`; somewhere upstream, \`order\` arrived undefined.

**What the agent needs:** the stack (which component, which line) *plus the network story*. Nine times out of ten the undefined traces back to an API response that wasn't what the code expected — an error object instead of data, an empty 200, a 404 the fetch never checked. Without the network evidence, the agent's fix is a defensive \`?.\` that hides the bug. With it, the agent fixes the *cause*: the failed request and the missing error path.

## 2. State that doesn't update (or updates one render late)

The classic stale-closure family: a click handler reads old state, a callback captures a variable from three renders ago, a list doesn't re-render after a mutation because the reference didn't change.

**What the agent needs:** the *exact action sequence with timing*. "Clicked Add, then immediately clicked Save, and the count showed the old value" is diagnosable — the agent can trace which closure captured what and when. "The count is sometimes wrong" is not. This is where a captured click-by-click timeline beats any prose description a human will realistically write.

## 3. Effects firing at the wrong time

Double-fetches from an effect, a subscription that outlives its component, an infinite render loop from an unstable dependency. The code *looks* right; the sequence of executions is wrong.

**What the agent needs:** the console and network in *chronological order* interleaved with user actions. Two identical fetches four milliseconds apart tell an agent "unstable dependency or missing cleanup" instantly. The order of events IS the evidence — which is why a screenshot, which flattens time, rarely helps with this class.

## 4. "It renders wrong" (hydration mismatches, conditional-render gaps)

The state was fine, the data was fine, and the DOM is still wrong: a hydration warning, a component that vanished, a modal that rendered behind the page.

**What the agent needs:** the actual DOM at the failure moment — not the JSX, which describes intent, but what React actually committed. A DOM replay lets the agent inspect the real element tree, classes, and inline styles at the exact broken frame.

## Capturing all four evidence types at once

You could gather each of these by hand per bug class — or capture everything, every time. That's the approach [TraceBug](https://tracebug.dev) takes (disclosure: I build it): a browser extension that records the DOM replay, console, network, and action timeline together, packaged as one local \`.html\` file your agent reads over a local MCP server. It works with any framework — React, Next.js, Vue, Svelte, plain HTML — because it captures at the browser level, not through React internals.

The React-specific payoff is that the four bug classes above stop needing different workflows. Undefined prop? The failing request is in the report. Stale state? The action timeline is in the report. Effect storm? The chronological console/network feed is in the report. Wrong render? The DOM replay is in the report. Capture once; the evidence for whichever class it turns out to be is already there — plus a [generated failing Playwright test](/blog/failing-playwright-test-from-bug-report) so the agent can prove the fix.

The [live sandbox](https://tracebug.dev/try.html) has an intentional TypeError of exactly the class-1 variety waiting for you. Capture it, hand it to [Claude Code](/blog/give-claude-code-browser-context) or [Cursor](/blog/report-bugs-to-cursor), and watch the difference evidence makes.
`.trim(),
  },
  {
    slug: "qa-bug-reporting-ai",
    title: "The QA workflow where your bug reports get fixed by AI (before standup)",
    description:
      "QA captures the bug once, with everything attached. The developer's AI agent reads it and starts fixing. A practical workflow for QA teams working with AI-assisted developers — including Sentry mode, the arm-once-capture-all-day trick.",
    date: "2026-08-01",
    readMinutes: 7,
    tag: "QA",
    cover: "/blog/qa-bug-reporting-ai/hero.jpg",
    content: `
Something changed on the developer side of the bug-report handoff, and most QA workflows haven't caught up with it yet: **the first reader of your bug report is increasingly an AI coding agent.** The developer receives your ticket, opens Claude Code or Cursor, and pastes your report in. Whatever you wrote is now the agent's entire knowledge of the bug.

This raises the bar and lowers it at the same time. Lowers it: you no longer need to write beautiful prose — agents don't care about prose. Raises it: agents are *ruthlessly* literal about missing evidence. A human developer fills gaps with intuition ("she probably means the staging env"). An agent fills gaps with guesses, and the fix comes back wrong. Which means the QA report that gets bugs fixed in 2026 is the one that's **complete**, not the one that's well-written.

## What "complete" means now

For an agent to fix a browser bug on the first pass, the report needs: the console error as text, the failing network request with its response, the exact click-by-click steps, the DOM state at the failure, and the environment. Writing all of that by hand for every bug is a part-time job — which is exactly why it doesn't happen, and why tickets bounce back with questions.

The practical answer is to stop *writing* reports and start *capturing* them. [TraceBug](https://tracebug.dev) (disclosure: I build it) is a free browser extension built around that idea: click Capture, reproduce the bug, and everything — DOM replay, console, network, screenshots, your steps — lands in one ticket you review and export. No account; nothing uploads; works on any site including staging environments behind logins.

## The Sentry-mode trick: arm once, capture all day

Here's the workflow detail that changes daily QA life. You don't know when the bug will happen — so recording on demand means the bug you just saw is already gone.

TraceBug's rolling mode fixes the timing problem: start one recording at the beginning of your test session and leave it running. It keeps a rolling buffer — bounded, not an ever-growing file — and when a bug appears, you snapshot **that moment** into a ticket and keep going. One arm-up in the morning; every bug of the day captured with full evidence, none of them requiring you to reproduce anything twice.

Each ticket gets your human layer on top: annotated screenshots (arrows, highlights, blur for sensitive data), a typed title and steps, priority. The evidence is automatic; the judgment is yours.

## The handoff that makes developers love QA

Export options map to wherever your team lives — GitHub issue, Jira, Linear, or the self-contained \`.html\` replay file. Two things in the export matter specifically for AI-assisted teams:

**The replay file is agent-readable.** The developer's agent reads it over a local MCP server — actual console errors, actual failed requests, your exact steps — instead of a paraphrase. Your capture becomes the agent's evidence, unfiltered.

**Every report embeds a failing Playwright test.** Generated from your captured session, it fails while your bug exists and passes when it's fixed. You've not only reported the bug — you've shipped the verification for it. When the fix lands, the test tells everyone it's real. ([How that works →](/blog/failing-playwright-test-from-bug-report))

The result, on teams that run this loop: QA captures at 4:50pm, the developer's agent reads it at 9am, and the fix — proven green against your captured test — is in review before standup. The bounce-back questions ("what browser? can you get the console?") disappear, because the answers were captured before anyone thought to ask.

## Try the loop without installing anything on your app

The [live sandbox](https://tracebug.dev/try.html) is a checkout page with intentional bugs. Run the workflow end to end: arm a session, trigger the coupon bug, snapshot it, annotate, export. Ten minutes, and you'll know whether this fits your team. The extension is free and open source — and if your compliance team asks where the data goes, the answer that makes that meeting short is: nowhere. It stays on your machine.
`.trim(),
  },
];

/** All posts, newest first. Async so a future backend swap is signature-compatible. */
export async function getAllPosts(): Promise<BlogPost[]> {
  return [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
}

/** One post by slug, or null. */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  return POSTS.find((p) => p.slug === slug) ?? null;
}
