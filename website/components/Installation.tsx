"use client";

import { useState } from "react";

export default function Installation() {
  const [activeTab, setActiveTab] = useState<"npm" | "extension" | "github">("npm");
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
              { key: "extension" as const, label: "Chrome Extension", icon: "🔌" },
              { key: "github" as const, label: "GitHub", icon: "⚡" },
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

        {/* Chrome Extension Tab */}
        {activeTab === "extension" && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-text-muted text-center text-sm mb-6">
              No code changes needed. Use TraceBug on any website directly from
              Chrome. Perfect for QA testers, PMs, and clients.
            </p>

            <div className="space-y-3">
              {[
                {
                  step: "1",
                  title: "Clone the repository",
                  code: "git clone https://github.com/prashantsinghmangat/tracebug-ai",
                  copyKey: "ext-clone",
                },
                {
                  step: "2",
                  title: "Build the extension",
                  code: "cd tracebug-ai && npm install && npm run build",
                  copyKey: "ext-build",
                },
              ].map((item) => (
                <div key={item.step} className="code-block rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-bold">
                        {item.step}
                      </span>
                      <span className="text-text-muted text-xs">{item.title}</span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(item.code, item.copyKey)}
                      className="text-xs text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
                    >
                      {copied === item.copyKey ? "✓ Copied!" : "Copy"}
                    </button>
                  </div>
                  <div className="p-4">
                    <pre className="text-sm font-mono">
                      <span className="text-text-muted select-none">$ </span>
                      <span className="text-green-400">{item.code.split(" ")[0]}</span>
                      <span className="text-text-primary"> {item.code.split(" ").slice(1).join(" ")}</span>
                    </pre>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-5 bg-surface border border-border rounded-xl">
              <h3 className="text-text-primary font-semibold text-sm mb-3">
                Load in Chrome
              </h3>
              <ol className="space-y-2">
                {[
                  "Open chrome://extensions/ in your browser",
                  'Enable "Developer mode" toggle in the top-right corner',
                  'Click "Load unpacked" button',
                  "Select the tracebug-extension/ folder from the cloned repo",
                  "The TraceBug icon will appear in your Chrome toolbar",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-text-muted">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-semibold">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
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
                  <span className="text-text-muted">     # creates tracebug-sdk-1.1.0.tgz</span>
                  {"\n"}
                  <span className="text-text-muted select-none">$ </span>
                  <span className="text-green-400">npm</span>
                  <span className="text-text-primary"> install ./tracebug-sdk-1.1.0.tgz</span>
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
