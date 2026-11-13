# Site Audit

Check any page for accessibility, layout, phone-width, performance, SEO and
runtime problems. You get a 0–100 score, one finding per real problem with
where it is and how to fix it, and a report your coding agent can read and
fix from. New in **1.12.0**.

The audit runs in the page you are on, in your browser. It is read-only: it
clicks, types and changes nothing. Nothing is uploaded.

## Run it

| Where | How |
| --- | --- |
| Extension popup | **Audit this page** (the first card) runs every check. Its arrow opens the four scans below. |
| On-page toolbar | The **Audit** button opens the Site Audit panel. |
| npm SDK | `await TraceBug.showAuditPanel("full")` (with the panel), or `await TraceBug.runAudit({ scan: "full" })` (data only). |

### The four scans

| Scan | Runs | Use it for |
| --- | --- | --- |
| **All checks** | accessibility, layout, phone width, performance, SEO, runtime | A full picture of one page |
| **Auto Review** | layout, phone width, runtime | Quick "is anything broken?" pass while testing |
| **Accessibility Audit** | axe-core WCAG 2.0–2.2 A/AA plus keyboard checks | Accessibility work |
| **Performance & SEO** | this page load's timings and files, page tags, robots.txt and sitemap | Launch and SEO checks |

## What it checks

### Accessibility
- **axe-core 4.11.4** (the engine behind Lighthouse and Accessibility
  Insights), WCAG 2.0, 2.1 and 2.2 at levels A and AA. Each finding names the
  WCAG success criterion it fails.
- Also on: **label in name** (the visible label must be part of the
  accessible name, WCAG 2.5.3).
- Colour-contrast findings show the colours found and the ratio required, and
  **suggest a text colour** that passes, re-checked after rounding.
- Keyboard checks (read from the page, nothing focused):
  `kbd/focus-outline-removed` (focus style removed with no replacement),
  `kbd/focus-obscured` (a sticky header would hide the focused element,
  WCAG 2.4.11), `kbd/positive-tabindex`, `kbd/focusable-invisible`.
- **Needs a person to check**: results axe could not decide (for example
  text on a background image). They are listed apart and never count against
  the score.

### Layout (`ui/…`)
Horizontal overflow, elements off-screen, controls covering other controls
(only when the covered control really can't be clicked), clipped text,
broken images, images without width/height.

### Phone width (`mobile/…`)
The page is loaded again in a hidden 390×844 frame on your machine. Reports
horizontal overflow, off-screen elements, and scrolling boxes a keyboard
can't reach. Skipped (and the panel says so) when the site forbids framing,
the load times out, or your window is already phone-sized.

### Performance (`perf/…`)
From this page load: LCP (names the element and says whether it was late to
render or a slow image), FCP, TTFB, main-thread blocking (Total Blocking Time,
measured like Lighthouse for the load only; Chrome-based browsers), CLS (the
worst burst of shifts, as web-vitals defines it). Good/poor thresholds:
LCP 2.5 s / 4 s, FCP 1.8 s / 3 s, TTFB 0.8 s / 1.8 s, blocking 0.2 s / 0.6 s,
CLS 0.1 / 0.25. Also render-blocking files, page weight over 3 MB, files
over 500 KB, images with 4× more pixels than needed, and JPEG/PNG over 100 KB
that WebP/AVIF would shrink.
On localhost, file sizes are skipped (dev builds are unminified).

### SEO (`seo/…`)
Title, meta description, canonical, one `<h1>`, viewport, `noindex`, Open
Graph and Twitter tags, JSON-LD structured data, and the site's
`/robots.txt` (does it block this page?) and sitemap. One page only: no
crawl, no ranking claims.

### Runtime (`runtime/…`)
What happened on this page since TraceBug started capturing: console errors,
failed requests, mixed content, rage clicks and dead clicks.

## The score

Each category and the page get a score from 0 to 100:
**90–100 good** (green), **50–89 fair** (amber), **0–49 poor** (red).

It starts at 100. Each distinct problem takes a share of what is left:
critical 20%, serious 12%, moderate 6%, minor 2%. The same problem on more
elements takes a quarter more per extra element, up to double. The overall
score counts every problem from the checks that ran; a check that did not
run is left out, never shown as passing.

The score reflects what the automated checks found. It is **not** a WCAG
conformance claim: automated checks find only part of accessibility
problems, which is why "Needs a person to check" exists.

Severity names: Critical, High (serious), Medium (moderate), Low (minor).

**Compared with Lighthouse** (12.8, same ten public sites, 2026-11-12): the
same bands and mostly the same axe failures. Accessibility reads lower here
on purpose: Lighthouse takes a fixed few points per failed rule whatever the
element count, while here the same rule on more elements costs more, and the
audit also scrolls first and runs label-in-name and keyboard checks.
Performance reads higher on fast pages because it uses your real load, not
Lighthouse's simulated slow network.

## The panel

- Opens docked to the right of the page; drag it by its header anywhere, or
  drop it near an edge to dock it there. It remembers where you left it.
- Header: the score, its band, a WCAG failures count, findings by severity
  (click one to filter), rules passed, and when it was scanned.
- Findings are grouped by rule. Each shows what is wrong, the WCAG criterion,
  **Found vs Required** values, **how to fix it**, and every element it was
  found on with **Locate** (scrolls to it and outlines it; the panel stays
  open) and **Copy selector**.
- **Fix with AI**: downloads the whole audit and copies a one-line prompt for
  an agent with the TraceBug MCP server (see below).
- **Copy for AI**: tick findings and copy a ready prompt for your coding
  agent with the evidence, selectors, fix and page HTML.
- **Export report**: a self-contained `.html` file (opens offline, no remote
  loads) that the MCP server reads.
- Run again after fixing: the panel shows what changed since the last run.

## Fix it with your coding agent

One-time setup: add the TraceBug MCP server to your agent (Claude Code:
`claude mcp add -s user tracebug -- npx -y tracebug mcp`; Cursor, Windsurf,
VS Code: [mcp.md](mcp.md)).

1. Run the audit, then click **Fix with AI**. It downloads the whole audit
   (`tracebug-audit-<host>-<time>.html`) and copies one line:
   *Fix the latest TraceBug site audit.* Keep the file in your Downloads
   folder (or the project): that's where the MCP server looks, newest first.
2. Paste the line into your agent, or in Claude Code run
   `/tracebug:fix_site_audit`. The agent reads the audit (`get_audit`) and
   each finding (`get_finding`: evidence, WCAG, fix, codebase search hints),
   groups findings only where the evidence shows a shared cause, and proposes
   one set of changes. **It asks before editing anything.**
3. After the changes, reload the page and press **Re-scan**: the panel shows
   what is fixed, still there, new or regressed. Export again (or Fix with AI)
   and the agent compares the two runs with `compare_audits`. A fix only
   counts as verified on a fresh audit, never because the code changed: the
   agent can't run the audit itself.

No MCP? Tick findings and use **Copy for AI**, then paste: the findings and
their evidence go in the prompt itself.

The panel can't tell whether your agent has the MCP server, so after Fix with
AI it always offers "Agent not set up?" instead of claiming a connection.

Text read from the audited page is marked untrusted in the MCP output, so
the agent treats it as data, not instructions.

## Limits

- One page, at the current window size (plus the 390px phone pass).
- Colours are checked in the theme the page is showing; switch theme and
  re-run to check the other.
- Text that is invisible when checked (content that fades in on scroll) is
  counted and named; scroll the page and re-run.
- Performance numbers come from one load on your machine, not lab or field
  data, so they will differ from PageSpeed Insights. Main-thread blocking is
  not measured in Firefox (the panel says so).
- Stylesheets from another site can't be read; the keyboard checks say how
  many were skipped.
