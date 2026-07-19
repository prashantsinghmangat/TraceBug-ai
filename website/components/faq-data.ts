// FAQ content — a plain (non-client) module so BOTH the client FAQ accordion
// and the server-rendered FAQPage JSON-LD in app/page.tsx can import it.
// Answers stay honest — no marketing inflation.
export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "What is TraceBug?",
    a: "TraceBug is a free, open-source bug-capture tool. When a bug happens in the browser, it captures the session replay, console errors, network requests, screenshots, and reproduction steps, and exports everything into one self-contained .html file that a developer — or an AI coding agent — can open and investigate. There's a Chrome extension for any website, and an npm SDK (tracebug-sdk) for your own app.",
  },
  {
    q: "Is it really free? What's the catch?",
    a: "Yes — free, MIT-licensed open source, no account, no credit card, and no server: everything runs in your browser and reports are saved as local files. There's no catch because there's no infrastructure to pay for. If paid team features ever appear, the local capture-and-export core stays free.",
  },
  {
    q: "Does my data leave the browser?",
    a: "No. Captures are stored in your browser and exported as local files on your machine. There are no uploads, no analytics, and no telemetry — you can audit the source on GitHub. Sensitive inputs (passwords, tokens, card numbers) are redacted before storage.",
  },
  {
    q: "How do AI coding agents use TraceBug reports?",
    a: "TraceBug ships a local MCP (Model Context Protocol) server: run `claude mcp add tracebug -- npx -y tracebug mcp` once, and Claude Code, Cursor, Windsurf, or any MCP client can read your exported reports — the console errors, failed requests, and repro timeline — and start debugging from real evidence. The server reads local files only; nothing is uploaded.",
  },
  {
    q: "How is TraceBug different from Sentry or LogRocket?",
    a: "Those are monitoring platforms: SDKs that continuously send your production data to their cloud, with dashboards and subscriptions. TraceBug is the hand-off layer for a single bug: on-demand capture, one offline file, no backend, free. They watch everything; TraceBug documents the bug in front of you well enough that someone can fix it.",
  },
  {
    q: "Does the person reporting the bug need an account or setup?",
    a: "No. A QA tester, designer, or client installs the Chrome extension and clicks capture — no account, no configuration. The exported .html file can be shared like any attachment, and it opens in any browser, offline.",
  },
  {
    q: "Does it work on any website?",
    a: "The Chrome extension works on any http/https page (Chrome, Edge, Brave, Opera). Browser-internal pages like chrome:// are off-limits by browser policy. For your own app, the npm SDK adds the capture toolbar with two lines of code and stays disabled on production by default.",
  },
  {
    q: "What exactly ends up inside an exported report?",
    a: "A pixel-accurate DOM session replay (rrweb, gzip-compressed), console output with stack traces, network requests with status and failing response bodies, screenshots with annotations, a millisecond-resolution timeline of user actions, environment details, and a root-cause hint. It's one .html file — typically well under a megabyte.",
  },
];
