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

If you just want to paste into a chat window, don't upload the replay file — it's built for browsers and MCP, not context windows. Use **Export for AI (.html)** or **Download report (.md)** from the More menu instead: a few KB of structured plain text that fits any model's context.

## Why local matters

The whole pipeline — capture, export, MCP server — runs on your machine. Bug reports contain your app's DOM, your network payloads, your users' sessions. With TraceBug that evidence goes from your browser to your disk to your agent, and nowhere else. It's MIT-licensed open source; audit it.
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
