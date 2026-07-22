import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Playwright Reporter — Bug Reports From Failed Tests — TraceBug",
  description:
    "Every failed Playwright test becomes a self-contained TraceBug .html bug report — assertion error, step timeline, console, network failures, and screenshot. Upload the folder as a CI artifact and hand any failure straight to your coding agent. No cloud viewer, no account, no upload.",
  openGraph: {
    title: "TraceBug Playwright Reporter — Failed Tests Become Agent-Ready Reports",
    description:
      "Two lines in playwright.config.ts turn every failure into a self-contained .html report the MCP server reads. Upload as a CI artifact; debug with Claude Code / Cursor.",
  },
};

export default function PlaywrightDocsPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-border text-text-muted text-sm mb-4">
              <span className="w-2 h-2 rounded-full bg-accent"></span>
              Documentation · Playwright Reporter
            </div>
            <h1 className="text-4xl font-bold text-text-primary mb-4">
              Bug Reports From Failed Tests
            </h1>
            <p className="text-text-muted text-lg leading-relaxed">
              Every failed Playwright test becomes a self-contained TraceBug{" "}
              <code className="text-primary bg-surface px-1 rounded">.html</code>{" "}
              bug report — the same artifact the Chrome extension exports,
              readable by the same{" "}
              <a
                href="/docs/mcp"
                className="text-accent hover:text-accent/80 transition-colors"
              >
                MCP server
              </a>
              . Upload the folder as a CI artifact and any developer can hand the
              failure straight to their coding agent.
            </p>
          </div>

          {/* Quick start */}
          <div className="code-block p-5 rounded-xl overflow-x-auto mb-6">
            <div className="flex items-center gap-2 mb-3 text-text-muted text-xs">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              <span className="ml-2">playwright.config.ts</span>
            </div>
            <pre className="text-sm font-mono text-text-primary leading-relaxed">
{`export default defineConfig({
  reporter: [
    ["list"],
    ["tracebug-sdk/playwright", { outputDir: "bug-reports" }],
  ],
});`}
            </pre>
          </div>

          {/* The differentiator callout */}
          <div className="bg-surface border border-accent/30 rounded-xl p-6 mb-12">
            <h3 className="text-text-primary font-semibold mb-2">
              🎭 No cloud viewer, no account, no upload
            </h3>
            <p className="text-text-muted text-sm leading-relaxed">
              The report opens as a full interactive replay in any browser, and{" "}
              <code className="text-primary bg-background px-1 rounded">
                npx -y tracebug mcp
              </code>{" "}
              serves it to Claude Code / Cursor. Nobody else captures bugs from
              test runs this way — cloud-based tools can&apos;t attach their
              viewer to a CI artifact.
            </p>
          </div>

          {/* Table of Contents */}
          <div className="bg-surface border border-border rounded-xl p-6 mb-12">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
              On this page
            </h2>
            <ul className="space-y-2">
              {[
                { href: "#setup", label: "Setup (two lines)" },
                { href: "#richer", label: "Richer reports: console + network" },
                { href: "#ci", label: "CI: upload reports as artifacts" },
                { href: "#debug", label: "Debug a failure with your agent" },
                { href: "#report", label: "What ends up in the report" },
                { href: "#options", label: "Options & behavior" },
              ].map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-accent hover:text-accent/80 transition-colors text-sm"
                  >
                    → {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Setup */}
          <section id="setup" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                1
              </span>
              Setup (two lines)
            </h2>
            <p className="text-text-muted mb-4 leading-relaxed">
              Add the reporter to{" "}
              <code className="text-primary bg-surface px-1 rounded">
                playwright.config.ts
              </code>{" "}
              (shown above) and install the SDK as a dev dependency if you
              haven&apos;t:
            </p>
            <div className="code-block p-4 rounded-xl mb-4">
              <pre className="text-text-primary font-mono text-sm">
                <span className="text-text-muted">$ </span>
                <span className="text-success">npm</span>
                <span className="text-text-primary"> i -D tracebug-sdk</span>
              </pre>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">
              That&apos;s it. Reporter-only mode already captures: the assertion
              error with stack + code snippet, the test step timeline (as repro
              steps), Playwright&apos;s failure screenshot (enable{" "}
              <code className="text-primary bg-surface px-1 rounded text-xs">
                screenshot: &quot;only-on-failure&quot;
              </code>{" "}
              in <code className="text-primary bg-surface px-1 rounded text-xs">use</code>
              ), project/browser metadata, and a root-cause hint.
            </p>
          </section>

          {/* Richer reports */}
          <section id="richer" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                2
              </span>
              Richer reports: page console + network
            </h2>
            <p className="text-text-muted mb-4 leading-relaxed">
              Wire the capture fixture so reports also include everything the
              page did — console output, page errors, network requests with
              failed-response bodies, and navigations:
            </p>
            <div className="code-block p-5 rounded-xl overflow-x-auto mb-4">
              <div className="flex items-center gap-2 mb-3 text-text-muted text-xs">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span className="ml-2">tests/fixtures.ts</span>
              </div>
              <pre className="text-sm font-mono text-text-primary leading-relaxed">
{`import { test as base } from "@playwright/test";
import { traceBugPage } from "tracebug-sdk/playwright";

export const test = base.extend({ page: traceBugPage });
export { expect } from "@playwright/test";`}
              </pre>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">
              Then import{" "}
              <code className="text-primary bg-surface px-1 rounded">test</code>/
              <code className="text-primary bg-surface px-1 rounded">expect</code>{" "}
              from{" "}
              <code className="text-primary bg-surface px-1 rounded">
                ./fixtures
              </code>{" "}
              instead of{" "}
              <code className="text-primary bg-surface px-1 rounded">
                @playwright/test
              </code>{" "}
              in your specs. The fixture attaches its capture only on failure —
              passing runs stay artifact-free — and caps each list at 500 entries
              so a chatty app can&apos;t bloat the artifact.
            </p>
          </section>

          {/* CI */}
          <section id="ci" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                3
              </span>
              CI: upload the reports as artifacts
            </h2>
            <div className="code-block p-5 rounded-xl overflow-x-auto">
              <div className="flex items-center gap-2 mb-3 text-text-muted text-xs">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span className="ml-2">.github/workflows/e2e.yml</span>
              </div>
              <pre className="text-sm font-mono text-text-primary leading-relaxed">
{`- name: Run Playwright tests
  run: npx playwright test

- name: Upload TraceBug reports
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: tracebug-reports
    path: bug-reports/`}
              </pre>
            </div>
          </section>

          {/* Debug */}
          <section id="debug" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                4
              </span>
              Debug a failure with your coding agent
            </h2>
            <p className="text-text-muted mb-4 leading-relaxed">
              Download the artifact into your repo and register the MCP server
              once:
            </p>
            <div className="code-block p-4 rounded-xl mb-4 overflow-x-auto">
              <pre className="text-text-primary font-mono text-sm">
                <span className="text-text-muted">$ </span>
                <span className="text-success">claude</span>
                <span className="text-text-primary"> mcp add tracebug -- npx -y tracebug mcp --dir ./bug-reports</span>
              </pre>
            </div>
            <p className="text-text-muted text-sm leading-relaxed mb-4">
              Then in Claude Code:{" "}
              <code className="text-primary bg-surface px-1 rounded">
                /tracebug:debug_bug_report
              </code>{" "}
              — the agent reads the failure&apos;s console errors, the 500 that
              preceded it, the step timeline, and the screenshot, then
              cross-references your code and proposes the fix. Or just open the{" "}
              <code className="text-primary bg-surface px-1 rounded">.html</code>{" "}
              in a browser and use the <strong className="text-text-primary">AI tab → Copy prompt</strong>.
            </p>
            <p className="text-text-muted text-sm mb-3 leading-relaxed">
              The reporter prints this hand-off at the end of every failing run:
            </p>
            <div className="code-block p-5 rounded-xl overflow-x-auto">
              <pre className="text-sm font-mono text-text-muted leading-relaxed">
{`[TraceBug] 1 bug report written:
  → bug-reports/tracebug-test-vendor-can-be-saved-…​.html
  Debug with your coding agent: claude mcp add tracebug -- npx -y tracebug mcp --dir bug-reports
  then /tracebug:debug_bug_report — or open the .html in a browser.`}
              </pre>
            </div>
            <p className="text-text-muted text-sm mt-4 leading-relaxed">
              The loop also runs the other way: every report exported from the
              widget embeds a <strong className="text-text-primary">generated failing
              Playwright spec</strong> that replays the captured session and asserts
              the failure is gone — the agent fetches it with{" "}
              <code className="text-primary bg-surface px-1 rounded">get_playwright_test</code>,
              runs it red, fixes, and reruns until green.
            </p>
          </section>

          {/* What ends up in the report */}
          <section id="report" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6">
              What ends up in the report
            </h2>
            <div className="space-y-2">
              {[
                { section: "Title / summary", source: "Test title + first assertion error line" },
                { section: "Description", source: "Full error message + Playwright code snippet + test file:line" },
                { section: "Repro steps & timeline", source: "test.step() hierarchy and pw:api calls, errors flagged" },
                { section: "Console", source: "Page console.* + uncaught page errors (fixture) + runner errors" },
                { section: "Network", source: "Every request; failures keep a 500-char response-body snippet (fixture)" },
                { section: "Screenshots", source: "Any image attachment — Playwright's screenshot-on-failure just works" },
                { section: "Root-cause hint", source: "Local heuristic: 5xx → high, 4xx/page error → medium, assertion-only → low" },
              ].map((row) => (
                <div
                  key={row.section}
                  className="flex flex-col sm:flex-row items-start gap-2 sm:gap-4 p-3 bg-surface border border-border rounded-lg"
                >
                  <span className="text-text-primary font-semibold text-sm flex-shrink-0 sm:w-52">
                    {row.section}
                  </span>
                  <p className="text-text-muted text-xs leading-relaxed">{row.source}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Options */}
          <section id="options" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6">
              Options &amp; behavior
            </h2>
            <div className="bg-surface border border-border rounded-xl p-4 mb-4">
              <p className="text-text-muted text-sm leading-relaxed">
                <code className="text-primary bg-background px-1 rounded">outputDir</code>{" "}
                (default{" "}
                <code className="text-primary bg-background px-1 rounded text-xs">
                  &quot;bug-reports&quot;
                </code>
                ) sets where the{" "}
                <code className="text-primary bg-background px-1 rounded text-xs">.html</code>{" "}
                reports are written.
              </p>
            </div>
            <ul className="space-y-3">
              {[
                "Reports are written only for the final retry of a failing test — no duplicates.",
                "skipped / interrupted tests are ignored.",
                "A reporter error can never fail your test run.",
                "Zero runtime deps — the module imports nothing from @playwright/test (structural types), so it builds and tests without Playwright installed.",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-text-muted text-sm leading-relaxed">
                  <span className="text-success flex-shrink-0 mt-0.5">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="bg-surface border border-border rounded-xl p-4 mt-6">
              <p className="text-text-muted text-sm leading-relaxed">
                <span className="text-accent font-semibold">Cypress?</span> On
                the roadmap — the artifact format is runner-agnostic, so a Cypress
                plugin only needs to assemble the same payload. Open an issue if
                you want it prioritized.
              </p>
            </div>
          </section>

          {/* CTA */}
          <div className="bg-surface border border-border rounded-xl p-8 text-center">
            <h2 className="text-xl font-bold text-text-primary mb-2">
              A failed test is a bug report waiting to happen
            </h2>
            <p className="text-text-muted text-sm mb-6">
              Two lines in your config; every failure becomes an agent-ready
              artifact.
            </p>
            <div className="code-block p-4 rounded-xl inline-block text-left">
              <pre className="text-text-primary font-mono text-sm">
                <span className="text-text-muted">$ </span>
                <span className="text-success">npm</span>
                <span className="text-text-primary"> i -D tracebug-sdk</span>
              </pre>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
