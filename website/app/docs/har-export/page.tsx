import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "HAR Export — Portable Network Captures — TraceBug",
  description:
    "Export a session's captured network activity as a standard HAR 1.2 (HTTP Archive) file — the interchange format every browser DevTools, Charles, Fiddler, and Postman reads. A capture drops straight into any existing network-debugging workflow.",
  openGraph: {
    title: "TraceBug HAR Export — Your Network Capture Is a File You Own",
    description:
      "No competitor in the category ships a HAR export. TraceBug already captures the request/response data and runs zero-backend, so exporting it as a portable HAR 1.2 file is a natural fit.",
  },
};

export default function HarExportDocsPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-border text-text-muted text-sm mb-4">
              <span className="w-2 h-2 rounded-full bg-accent"></span>
              Documentation · HAR Export
            </div>
            <h1 className="text-4xl font-bold text-text-primary mb-4">
              Portable Network Captures
            </h1>
            <p className="text-text-muted text-lg leading-relaxed">
              TraceBug can export a session&apos;s captured network activity as a
              standard <strong className="text-text-primary">HAR 1.2</strong>{" "}
              (HTTP Archive) file — the interchange format every browser DevTools,
              Charles, Fiddler, and Postman reads. A capture drops straight into
              any existing network-debugging workflow.
            </p>
          </div>

          {/* The differentiator callout */}
          <div className="bg-surface border border-accent/30 rounded-xl p-6 mb-12">
            <h3 className="text-text-primary font-semibold mb-2">
              🌐 Your network capture is a standard file you own
            </h3>
            <p className="text-text-muted text-sm leading-relaxed">
              No competitor in the category ships a HAR export — Jam even markets
              &quot;everything a HAR offers&quot; without one. Because TraceBug
              already captures the request/response data and runs zero-backend,
              exporting it as a portable, tool-agnostic file is a natural fit and
              a clean data-ownership story: not a row in someone&apos;s cloud.
            </p>
          </div>

          {/* Table of Contents */}
          <div className="bg-surface border border-border rounded-xl p-6 mb-12">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
              On this page
            </h2>
            <ul className="space-y-2">
              {[
                { href: "#how", label: "How to export" },
                { href: "#whats-in-it", label: "What's in it" },
                { href: "#sdk", label: "Programmatic use (SDK)" },
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

          {/* How to export */}
          <section id="how" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                1
              </span>
              How to export
            </h2>
            <p className="text-text-muted mb-4 leading-relaxed">
              In the Quick Bug modal, click{" "}
              <strong className="text-text-primary">🌐 Export HAR</strong>. A{" "}
              <code className="text-primary bg-surface px-1 rounded">.har</code>{" "}
              file downloads with every captured request in chronological order.
              Open it in:
            </p>
            <div className="space-y-3">
              {[
                {
                  tool: "Chrome / Edge / Firefox DevTools",
                  how: "Network tab → right-click → Import HAR",
                },
                {
                  tool: "Charles / Fiddler / Proxyman",
                  how: "File → Import",
                },
                {
                  tool: "Postman",
                  how: "Import → the requests become a collection",
                },
              ].map((row) => (
                <div
                  key={row.tool}
                  className="flex flex-col sm:flex-row items-start gap-2 sm:gap-4 p-4 bg-surface border border-border rounded-lg"
                >
                  <span className="text-text-primary font-semibold text-sm flex-shrink-0 sm:w-64">
                    {row.tool}
                  </span>
                  <p className="text-text-muted text-sm leading-relaxed">{row.how}</p>
                </div>
              ))}
            </div>
          </section>

          {/* What's in it */}
          <section id="whats-in-it" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                2
              </span>
              What&apos;s in it
            </h2>
            <p className="text-text-muted mb-4 leading-relaxed">
              For each request TraceBug captured:
            </p>
            <div className="space-y-2 mb-6">
              {[
                { field: "request.method, request.url", source: "The captured method and (sanitized) URL" },
                { field: "request.queryString", source: "Parsed from the URL into name/value pairs" },
                { field: "response.status, response.statusText", source: "The captured status + its standard reason phrase" },
                { field: "response.content.text", source: "The failed-response body snippet (failures only)" },
                { field: "response.content.mimeType", source: "Guessed from the body shape (JSON / HTML / XML / text)" },
                { field: "time, timings.wait", source: "The captured request duration" },
                { field: "pages[0], browser", source: "The page URL and browser/version from the environment" },
              ].map((row) => (
                <div
                  key={row.field}
                  className="flex flex-col sm:flex-row items-start gap-2 sm:gap-4 p-3 bg-surface border border-border rounded-lg"
                >
                  <code className="text-primary font-mono text-xs flex-shrink-0 sm:w-64 mt-0.5">
                    {row.field}
                  </code>
                  <p className="text-text-muted text-xs leading-relaxed">{row.source}</p>
                </div>
              ))}
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-text-muted text-sm leading-relaxed">
                Fields TraceBug doesn&apos;t capture — request/response{" "}
                <strong className="text-text-primary">headers</strong> and{" "}
                <strong className="text-text-primary">cookies</strong> — are
                emitted as empty arrays, and timing phases we didn&apos;t measure
                as{" "}
                <code className="text-primary bg-background px-1 rounded text-xs">
                  -1
                </code>
                , both valid per the HAR 1.2 schema. URLs are already sanitized at
                capture (sensitive query params replaced with{" "}
                <code className="text-primary bg-background px-1 rounded text-xs">
                  [REDACTED]
                </code>
                ).
              </p>
            </div>
          </section>

          {/* SDK */}
          <section id="sdk" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6">
              Programmatic use (SDK)
            </h2>
            <div className="code-block p-5 rounded-xl overflow-x-auto">
              <pre className="text-sm font-mono text-text-primary leading-relaxed">
{`import { buildHar, exportSessionAsHar, generateReport } from "tracebug-sdk";

const report = generateReport();

// Pure — returns the HAR 1.2 object, no side effects:
const har = buildHar(report, "1.6.0");
console.log(har.log.entries.length);

// Or build + trigger a browser download:
const { filename, entryCount } = exportSessionAsHar(report);`}
              </pre>
            </div>
          </section>

          {/* CTA */}
          <div className="bg-surface border border-border rounded-xl p-8 text-center">
            <h2 className="text-xl font-bold text-text-primary mb-2">
              One click, one portable file
            </h2>
            <p className="text-text-muted text-sm">
              Export HAR from any capture and drop it into the network tool you
              already use — no lock-in, no cloud.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
