import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Documentation — TraceBug",
  description:
    "Complete guide to integrating TraceBug SDK and Chrome Extension. Setup in 2 lines of code. API reference, configuration, and framework examples.",
  openGraph: {
    title: "TraceBug Documentation",
    description:
      "Setup guide, API reference, and framework examples for TraceBug.",
  },
};

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-border text-text-muted text-sm mb-4">
              <span className="w-2 h-2 rounded-full bg-accent"></span>
              Documentation
            </div>
            <h1 className="text-4xl font-bold text-text-primary mb-4">
              TraceBug Documentation
            </h1>
            <p className="text-text-muted text-lg">
              Everything you need to integrate TraceBug into your project and
              start generating developer-ready bug reports.
            </p>
          </div>

          {/* Table of Contents */}
          <div className="bg-surface border border-border rounded-xl p-6 mb-12">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
              On this page
            </h2>
            <ul className="space-y-2">
              {[
                { href: "#getting-started", label: "Getting Started" },
                { href: "#sdk-setup", label: "SDK Setup" },
                { href: "#chrome-extension", label: "Chrome Extension Usage" },
                { href: "#bug-report-format", label: "Bug Report Format" },
                { href: "#github-integration", label: "GitHub Integration" },
                { href: "#api-reference", label: "API Reference" },
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

          {/* Getting Started */}
          <section id="getting-started" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                1
              </span>
              Getting Started
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-text-muted mb-6 leading-relaxed">
                TraceBug is a zero-backend bug reporting tool that works
                entirely in the browser. All data is stored in localStorage —
                no servers, no API keys, no external dependencies required.
              </p>
              <div className="bg-surface border border-border rounded-xl p-6 mb-6">
                <h3 className="text-text-primary font-semibold mb-3">
                  Requirements
                </h3>
                <ul className="space-y-2 text-text-muted text-sm">
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">✓</span>
                    Any frontend framework (React, Vue, Angular, Next.js, Svelte, plain HTML)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">✓</span>
                    Modern browser (Chrome, Edge, Brave, Opera recommended)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">✓</span>
                    Node.js 18+ for the npm package
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* SDK Setup */}
          <section id="sdk-setup" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                2
              </span>
              SDK Setup
            </h2>

            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-3">
                  Install via npm
                </h3>
                <div className="code-block p-4 rounded-xl mb-4">
                  <div className="flex items-center gap-2 mb-3 text-text-muted text-xs">
                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                    <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                    <span className="w-3 h-3 rounded-full bg-green-500"></span>
                    <span className="ml-2">Terminal</span>
                  </div>
                  <pre className="text-text-primary font-mono text-sm">
                    <span className="text-text-muted">$ </span>
                    <span className="text-green-400">npm</span>
                    <span className="text-text-primary"> install tracebug-sdk</span>
                  </pre>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-3">
                  Initialize in your app
                </h3>
                <div className="code-block p-4 rounded-xl mb-4">
                  <div className="flex items-center gap-2 mb-3 text-text-muted text-xs">
                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                    <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                    <span className="w-3 h-3 rounded-full bg-green-500"></span>
                    <span className="ml-2">app/layout.tsx (Next.js) or index.tsx (React)</span>
                  </div>
                  <pre className="text-text-primary font-mono text-sm leading-relaxed">
                    <span className="text-purple-400">import</span>
                    <span className="text-text-primary"> TraceBug </span>
                    <span className="text-purple-400">from</span>
                    <span className="text-yellow-400"> &quot;tracebug-sdk&quot;</span>
                    <span className="text-text-primary">;</span>
                    {"\n\n"}
                    <span className="text-text-muted">{"// Initialize once at app startup"}</span>
                    {"\n"}
                    <span className="text-cyan-400">TraceBug</span>
                    <span className="text-text-primary">.</span>
                    <span className="text-blue-400">init</span>
                    <span className="text-text-primary">{"({"}</span>
                    {"\n"}
                    <span className="text-text-primary">{"  "}</span>
                    <span className="text-text-primary">projectId: </span>
                    <span className="text-yellow-400">&quot;my-app&quot;</span>
                    <span className="text-text-muted">,</span>
                    {"\n"}
                    <span className="text-text-primary">{"  "}</span>
                    <span className="text-text-primary">enabled: </span>
                    <span className="text-yellow-400">&quot;auto&quot;</span>
                    <span className="text-text-muted">,  </span>
                    <span className="text-text-muted">{"// auto | development | all | off"}</span>
                    {"\n"}
                    <span className="text-text-primary">{"});"}</span>
                  </pre>
                </div>

                <div className="bg-surface border border-border rounded-xl p-4">
                  <p className="text-text-muted text-sm">
                    <span className="text-accent font-semibold">Note:</span>{" "}
                    The <code className="text-primary bg-background px-1 rounded">enabled: &quot;auto&quot;</code> option activates TraceBug only
                    on localhost and staging environments. Use{" "}
                    <code className="text-primary bg-background px-1 rounded">&quot;all&quot;</code> to enable in
                    production as well.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-3">
                  Configuration Options
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-text-muted py-3 pr-6">Option</th>
                        <th className="text-left text-text-muted py-3 pr-6">Type</th>
                        <th className="text-left text-text-muted py-3 pr-6">Default</th>
                        <th className="text-left text-text-muted py-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-text-muted">
                      {[
                        { opt: "projectId", type: "string", def: "required", desc: "Identifies your application" },
                        { opt: "maxEvents", type: "number", def: "200", desc: "Max events per session" },
                        { opt: "maxSessions", type: "number", def: "50", desc: "Max sessions in localStorage" },
                        { opt: "enableDashboard", type: "boolean", def: "true", desc: "Show the floating bug button" },
                        { opt: "enabled", type: "string | string[]", def: '"auto"', desc: "auto | development | staging | all | off | hostname[]" },
                      ].map((row) => (
                        <tr key={row.opt} className="border-b border-border/50">
                          <td className="py-3 pr-6">
                            <code className="text-primary">{row.opt}</code>
                          </td>
                          <td className="py-3 pr-6 text-yellow-400 font-mono text-xs">{row.type}</td>
                          <td className="py-3 pr-6 font-mono text-xs text-cyan-400">{row.def}</td>
                          <td className="py-3">{row.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {/* Chrome Extension */}
          <section id="chrome-extension" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                3
              </span>
              Chrome Extension Usage
            </h2>
            <p className="text-text-muted mb-6 leading-relaxed">
              The Chrome Extension lets QA testers and non-developers use
              TraceBug on any website without touching code.
            </p>
            <div className="space-y-4">
              {[
                { step: "1", text: "Open chrome://extensions/ in Chrome" },
                { step: "2", text: 'Enable "Developer mode" in the top right' },
                { step: "3", text: 'Click "Load unpacked" and select the tracebug-extension/ folder' },
                { step: "4", text: "Navigate to any website you want to test" },
                { step: "5", text: "Click the TraceBug extension icon in your toolbar" },
                { step: "6", text: 'Click "Enable on this site" to start recording' },
                { step: "7", text: "Reproduce the bug, then click the 🐛 button that appears" },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex items-start gap-4 p-4 bg-surface border border-border rounded-lg"
                >
                  <span className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0 mt-0.5">
                    {item.step}
                  </span>
                  <p className="text-text-muted text-sm leading-relaxed">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Bug Report Format */}
          <section id="bug-report-format" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                4
              </span>
              Bug Report Format
            </h2>
            <p className="text-text-muted mb-6 leading-relaxed">
              Every bug report generated by TraceBug contains the following
              structured sections:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { icon: "🔍", title: "Reproduction Steps", desc: "Auto-generated numbered steps from event timeline" },
                { icon: "💥", title: "Console Errors", desc: "Full error messages with stack traces and source locations" },
                { icon: "🌐", title: "Network Log", desc: "All API calls with URL, method, status code, duration" },
                { icon: "📸", title: "Screenshots", desc: "Captured screenshots with annotations and timestamps" },
                { icon: "🖥️", title: "Environment Info", desc: "Browser, OS, viewport, device type, connection type" },
                { icon: "📋", title: "Session Timeline", desc: "Color-coded event log with elapsed timestamps" },
                { icon: "🎤", title: "Voice Notes", desc: "Tester voice descriptions converted to text" },
                { icon: "⚡", title: "Performance Data", desc: "API response times, slowest calls, success rate" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-4 bg-surface border border-border rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <div>
                      <h3 className="text-text-primary font-semibold text-sm mb-1">
                        {item.title}
                      </h3>
                      <p className="text-text-muted text-xs leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* GitHub Integration */}
          <section id="github-integration" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                5
              </span>
              GitHub Integration
            </h2>
            <p className="text-text-muted mb-6 leading-relaxed">
              TraceBug generates properly formatted GitHub Issue markdown. One
              click copies the report to clipboard, ready to paste into a new
              GitHub Issue.
            </p>
            <div className="code-block p-4 rounded-xl mb-6">
              <div className="flex items-center gap-2 mb-3 text-text-muted text-xs">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span className="ml-2">GitHub Issue — Auto-generated</span>
              </div>
              <pre className="text-sm font-mono leading-relaxed text-text-muted overflow-x-auto">
                <span className="text-text-primary">## 🐛 Vendor Update Fails — TypeError</span>{"\n\n"}
                <span className="text-yellow-400">**Environment:**</span> Chrome 121, Windows 11, 1920x1080{"\n"}
                <span className="text-yellow-400">**Reported:**</span> 2026-03-12 14:23:01{"\n\n"}
                <span className="text-text-primary">## Steps to Reproduce</span>{"\n"}
                1. Navigate to /vendor{"\n"}
                2. Click {'"Edit"'} button (role=button){"\n"}
                3. Select {'"Inactive"'} from Status dropdown{"\n"}
                4. Click {'"Update"'} button{"\n\n"}
                <span className="text-text-primary">## Console Errors</span>{"\n"}
                <span className="text-red-400">```{"\n"}TypeError: Cannot read properties of undefined (reading 'status'){"\n"}  at updateVendor (vendor/page.tsx:42:18){"\n"}```</span>
              </pre>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-text-muted text-sm">
                <span className="text-accent font-semibold">Programmatic access:</span>{" "}
                Call{" "}
                <code className="text-primary bg-background px-1 rounded">TraceBug.getGitHubIssue()</code>{" "}
                to get the markdown string, or{" "}
                <code className="text-primary bg-background px-1 rounded">TraceBug.getJiraTicket()</code>{" "}
                for Jira markup format.
              </p>
            </div>
          </section>

          {/* API Reference */}
          <section id="api-reference" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                6
              </span>
              API Reference
            </h2>
            <div className="space-y-6">
              {[
                {
                  category: "Recording Control",
                  methods: [
                    { sig: "TraceBug.init(config)", desc: "Initialize and start recording" },
                    { sig: "TraceBug.pauseRecording()", desc: "Pause event capture" },
                    { sig: "TraceBug.resumeRecording()", desc: "Resume event capture" },
                    { sig: "TraceBug.isRecording()", desc: "Returns boolean — is recording active" },
                    { sig: "TraceBug.getSessionId()", desc: "Returns current session ID string" },
                  ],
                },
                {
                  category: "Screenshots",
                  methods: [
                    { sig: "TraceBug.takeScreenshot()", desc: "Capture screenshot — returns Promise<Screenshot>" },
                    { sig: "TraceBug.getScreenshots()", desc: "Get all captured screenshots array" },
                  ],
                },
                {
                  category: "Voice Recording",
                  methods: [
                    { sig: "TraceBug.isVoiceSupported()", desc: "Check if Web Speech API is available" },
                    { sig: "TraceBug.startVoiceRecording({ onUpdate, onStatus })", desc: "Start speech-to-text" },
                    { sig: "TraceBug.stopVoiceRecording()", desc: "Stop recording — returns VoiceTranscript" },
                    { sig: "TraceBug.isVoiceRecording()", desc: "Returns boolean — is voice active" },
                  ],
                },
                {
                  category: "Reports",
                  methods: [
                    { sig: "TraceBug.generateReport()", desc: "Generate complete BugReport object" },
                    { sig: "TraceBug.getGitHubIssue()", desc: "Get GitHub Issue markdown string" },
                    { sig: "TraceBug.getJiraTicket()", desc: "Get Jira ticket markup string" },
                    { sig: "TraceBug.getBugTitle()", desc: "Get auto-generated bug title" },
                    { sig: "TraceBug.downloadPdf()", desc: "Open print dialog for PDF export" },
                  ],
                },
                {
                  category: "Data Management",
                  methods: [
                    { sig: "getAllSessions()", desc: "Get all stored sessions array" },
                    { sig: "clearAllSessions()", desc: "Delete all sessions from localStorage" },
                    { sig: "deleteSession(id)", desc: "Delete a specific session by ID" },
                    { sig: "TraceBug.destroy()", desc: "Tear down TraceBug completely" },
                  ],
                },
              ].map((group) => (
                <div key={group.category}>
                  <h3 className="text-text-primary font-semibold mb-3 text-sm uppercase tracking-wider text-text-muted">
                    {group.category}
                  </h3>
                  <div className="space-y-2">
                    {group.methods.map((method) => (
                      <div
                        key={method.sig}
                        className="flex items-start gap-4 p-3 bg-surface border border-border rounded-lg"
                      >
                        <code className="text-primary font-mono text-xs flex-shrink-0 mt-0.5">
                          {method.sig}
                        </code>
                        <p className="text-text-muted text-xs">{method.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </main>
  );
}
