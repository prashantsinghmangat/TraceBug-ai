"use client";

import { useState } from "react";

export default function Installation() {
  const [activeTab, setActiveTab] = useState<"npm" | "extension" | "github" | "cli">("npm");
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
      });
    }
  };

  return (
    <section id="install" className="py-24 bg-background relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 blur-[100px] rounded-full pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            Installation
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
            Get Started in{" "}
            <span className="gradient-text">Under 2 Minutes</span>
          </h2>
          <p className="text-text-muted text-lg max-w-xl mx-auto">
            Choose the installation method that fits your workflow. SDK for
            developers, Chrome Extension for everyone else.
          </p>
        </div>

        {/* Tab selector */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-surface border border-border rounded-xl p-1 gap-1">
            {[
              { key: "npm" as const, label: "npm (SDK)", icon: "📦" },
              { key: "cli" as const, label: "CLI Setup", icon: "⚡" },
              { key: "extension" as const, label: "Chrome Extension", icon: "🔌" },
              { key: "github" as const, label: "GitHub", icon: "🔗" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-primary text-white shadow-glow-sm"
                    : "text-text-muted hover:text-text-primary hover:bg-background"
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* npm Tab */}
        {activeTab === "npm" && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-text-muted text-center text-sm mb-6">
              Install the SDK into any JavaScript/TypeScript project. Works with
              React, Vue, Angular, Next.js, Svelte, and plain HTML.
            </p>

            {/* Step 1: Install */}
            <div className="code-block rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                  <span className="ml-2 text-text-muted text-xs font-mono">Terminal</span>
                </div>
                <button
                  onClick={() => copyToClipboard("npm install tracebug-sdk", "npm-install")}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
                >
                  {copied === "npm-install" ? (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
                  ) : (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy</>
                  )}
                </button>
              </div>
              <div className="p-4">
                <pre className="text-sm font-mono">
                  <span className="text-text-muted select-none">$ </span>
                  <span className="text-green-400">npm</span>
                  <span className="text-text-primary"> install tracebug-sdk</span>
                </pre>
              </div>
            </div>

            {/* Step 2: Initialize */}
            <div className="code-block rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                  <span className="ml-2 text-text-muted text-xs font-mono">app/layout.tsx or index.tsx</span>
                </div>
                <button
                  onClick={() => copyToClipboard(`import TraceBug from "tracebug-sdk";\nTraceBug.init({ projectId: "my-app" });`, "npm-init")}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
                >
                  {copied === "npm-init" ? (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
                  ) : (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy</>
                  )}
                </button>
              </div>
              <div className="p-4 space-y-1">
                <pre className="text-sm font-mono leading-relaxed">
                  <span className="text-purple-400">import</span>
                  <span className="text-text-primary"> TraceBug </span>
                  <span className="text-purple-400">from</span>
                  <span className="text-yellow-400"> &quot;tracebug-sdk&quot;</span>
                  <span className="text-text-primary">;</span>
                  {"\n\n"}
                  <span className="text-text-muted">{"// Add this to your app entry point"}</span>
                  {"\n"}
                  <span className="text-cyan-400">TraceBug</span>
                  <span className="text-text-primary">.</span>
                  <span className="text-blue-400">init</span>
                  <span className="text-text-primary">{"({"}</span>
                  {"\n"}
                  <span className="text-text-primary">{"  "}</span>
                  <span className="text-text-primary">projectId</span>
                  <span className="text-text-muted">: </span>
                  <span className="text-yellow-400">&quot;my-app&quot;</span>
                  <span className="text-text-muted">,</span>
                  {"\n"}
                  <span className="text-text-primary">{"  "}</span>
                  <span className="text-text-primary">enabled</span>
                  <span className="text-text-muted">: </span>
                  <span className="text-yellow-400">&quot;auto&quot;</span>
                  <span className="text-text-muted">,    </span>
                  <span className="text-text-muted">{"// dev + staging only"}</span>
                  {"\n"}
                  <span className="text-text-primary">{"});"}</span>
                </pre>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-surface border border-border rounded-xl">
              <span className="text-accent text-lg mt-0.5">💡</span>
              <div>
                <p className="text-text-primary text-sm font-medium mb-1">That&apos;s it!</p>
                <p className="text-text-muted text-sm">
                  A floating 🐛 button will appear in the bottom-right corner of your app. Click it to open
                  the dashboard, view sessions, and generate bug reports.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CLI Tab */}
        {activeTab === "cli" && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-text-muted text-center text-sm mb-6">
              Auto-detects your framework and prints the exact setup snippet.
            </p>

            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between bg-background px-4 py-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/70"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500/70"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500/70"></div>
                  </div>
                  <span className="ml-2 text-text-muted text-xs font-mono">Terminal</span>
                </div>
                <button
                  onClick={() => copyToClipboard("npx tracebug init", "cli")}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  {copied === "cli" ? "✓ Copied" : "Copy"}
                </button>
              </div>
              <div className="p-4 space-y-1">
                <pre className="text-sm font-mono leading-relaxed">
                  <span className="text-text-muted select-none">$ </span>
                  <span className="text-green-400">npx</span>
                  <span className="text-text-primary"> tracebug init</span>
                  {"\n\n"}
                  <span className="text-cyan-400">TraceBug</span>
                  <span className="text-text-muted"> — Setting up bug reporting</span>
                  {"\n\n"}
                  <span className="text-text-muted">  Detected framework: </span>
                  <span className="text-green-400">nextjs</span>
                  {"\n\n"}
                  <span className="text-text-primary">  Add this to your project:</span>
                  {"\n"}
                  <span className="text-text-muted">  ───────────────────────────</span>
                  {"\n"}
                  <span className="text-cyan-400">  {`import TraceBug from "tracebug-sdk";`}</span>
                  {"\n"}
                  <span className="text-cyan-400">  {`TraceBug.init({ projectId: "my-app" });`}</span>
                  {"\n"}
                  <span className="text-text-muted">  ───────────────────────────</span>
                  {"\n\n"}
                  <span className="text-green-400">  Done!</span>
                  <span className="text-text-muted"> TraceBug is ready.</span>
                </pre>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-surface border border-border rounded-xl">
              <span className="text-cyan-400 text-lg mt-0.5">💡</span>
              <p className="text-text-muted text-sm">
                Supports <strong className="text-text-primary">React</strong>, <strong className="text-text-primary">Next.js</strong>, <strong className="text-text-primary">Vue</strong>, <strong className="text-text-primary">Angular</strong>, <strong className="text-text-primary">Svelte</strong>, <strong className="text-text-primary">Nuxt</strong>, and <strong className="text-text-primary">vanilla JS</strong>.
                The CLI auto-detects your framework from package.json.
              </p>
            </div>
          </div>
        )}

        {/* Chrome Extension Tab */}
        {activeTab === "extension" && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-text-muted text-center text-sm mb-6">
              No code changes needed. Use TraceBug on any website. Works in Chrome, Edge, Brave, and Opera.
            </p>

            {/* Chrome Web Store - Primary */}
            <a
              href="https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-5 bg-primary/10 border-2 border-primary/30 rounded-xl hover:border-primary/60 transition-colors group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="12" r="4"/>
                  <line x1="21.17" y1="8" x2="12" y2="8"/>
                  <line x1="3.95" y1="6.06" x2="8.54" y2="14"/>
                  <line x1="10.88" y1="21.94" x2="15.46" y2="14"/>
                </svg>
              </div>
              <div>
                <div className="text-text-primary font-semibold text-sm group-hover:text-primary transition-colors">Install from Chrome Web Store</div>
                <div className="text-text-muted text-xs mt-0.5">One-click install — recommended for Chrome, Edge, Brave, Opera</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted ml-auto flex-shrink-0">
                <path d="M7 17L17 7M17 7H7M17 7v10"/>
              </svg>
            </a>

            {/* Other browsers */}
            <div className="p-5 bg-surface border border-border rounded-xl">
              <h3 className="text-text-primary font-semibold text-sm mb-3">Browser Compatibility</h3>
              <div className="space-y-3 text-sm">
                {[
                  { browser: "Google Chrome", method: "Install from Chrome Web Store (link above)", supported: true },
                  { browser: "Microsoft Edge", method: "Install from Chrome Web Store — Edge supports Chrome extensions natively", supported: true },
                  { browser: "Brave", method: "Install from Chrome Web Store — Brave supports Chrome extensions natively", supported: true },
                  { browser: "Opera", method: "Install \"Install Chrome Extensions\" add-on first, then install from Chrome Web Store", supported: true },
                  { browser: "Firefox", method: "Not supported yet — Firefox uses a different extension format (Manifest V2). Use the npm SDK instead.", supported: false },
                  { browser: "Safari", method: "Not supported — use the npm SDK instead", supported: false },
                ].map((item) => (
                  <div key={item.browser} className="flex items-start gap-3">
                    <span className={`mt-0.5 flex-shrink-0 ${item.supported ? "text-green-400" : "text-text-muted"}`}>
                      {item.supported ? "✓" : "—"}
                    </span>
                    <div>
                      <span className="text-text-primary font-medium">{item.browser}</span>
                      <span className="text-text-muted ml-2">— {item.method}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Developer install (collapsible) */}
            <details className="p-5 bg-surface border border-border rounded-xl">
              <summary className="text-text-primary font-semibold text-sm cursor-pointer">
                Developer install (from source)
              </summary>
              <div className="mt-4 space-y-3">
                <div className="code-block rounded-lg overflow-hidden">
                  <div className="p-3">
                    <pre className="text-xs font-mono">
                      <span className="text-text-muted select-none">$ </span>
                      <span className="text-green-400">git clone</span>
                      <span className="text-text-primary"> https://github.com/prashantsinghmangat/tracebug-ai</span>
                      {"\n"}
                      <span className="text-text-muted select-none">$ </span>
                      <span className="text-green-400">cd</span>
                      <span className="text-text-primary"> tracebug-ai && npm install && npm run build</span>
                    </pre>
                  </div>
                </div>
                <ol className="space-y-1.5 text-xs text-text-muted">
                  <li>1. Open <code className="text-primary bg-background px-1 rounded">chrome://extensions/</code></li>
                  <li>2. Enable &quot;Developer mode&quot; toggle</li>
                  <li>3. Click &quot;Load unpacked&quot; → select the <code className="text-primary bg-background px-1 rounded">tracebug-extension/</code> folder</li>
                </ol>
              </div>
            </details>
          </div>
        )}

        {/* GitHub Tab */}
        {activeTab === "github" && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-text-muted text-center text-sm mb-6">
              Install directly from GitHub — useful for offline teams or when
              you need the absolute latest version.
            </p>

            <div className="code-block rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                  <span className="ml-2 text-text-muted text-xs font-mono">Terminal — Install from GitHub</span>
                </div>
                <button
                  onClick={() => copyToClipboard("npm install github:prashantsinghmangat/tracebug-ai", "gh-install")}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
                >
                  {copied === "gh-install" ? "✓ Copied!" : "Copy"}
                </button>
              </div>
              <div className="p-4">
                <pre className="text-sm font-mono">
                  <span className="text-text-muted select-none">$ </span>
                  <span className="text-green-400">npm</span>
                  <span className="text-text-primary"> install github:prashantsinghmangat/tracebug-ai</span>
                </pre>
              </div>
            </div>

            <div className="code-block rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                  <span className="ml-2 text-text-muted text-xs font-mono">Terminal — Install from .tgz (offline)</span>
                </div>
              </div>
              <div className="p-4 space-y-1">
                <pre className="text-sm font-mono leading-relaxed">
                  <span className="text-text-muted select-none">$ </span>
                  <span className="text-green-400">cd</span>
                  <span className="text-text-primary"> tracebug-ai</span>
                  {"\n"}
                  <span className="text-text-muted select-none">$ </span>
                  <span className="text-green-400">npm</span>
                  <span className="text-text-primary"> pack</span>
                  <span className="text-text-muted">     # creates tracebug-sdk-1.2.0.tgz</span>
                  {"\n"}
                  <span className="text-text-muted select-none">$ </span>
                  <span className="text-green-400">npm</span>
                  <span className="text-text-primary"> install ./tracebug-sdk-1.2.0.tgz</span>
                </pre>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-surface border border-border rounded-xl">
              <span className="text-yellow-400 text-lg mt-0.5">⚠️</span>
              <p className="text-text-muted text-sm">
                The <code className="text-primary bg-background px-1 rounded text-xs">prepare</code> script
                runs <code className="text-primary bg-background px-1 rounded text-xs">tsup</code> automatically
                on install, so the SDK is built fresh for your environment.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
