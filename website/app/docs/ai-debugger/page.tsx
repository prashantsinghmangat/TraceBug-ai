import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "AI Debugger — BYO-Key LLM Analysis — TraceBug",
  description:
    "Run LLM-powered root-cause analysis on a bug report using your own API key — Anthropic, OpenAI, or a local Ollama. The call goes directly from the browser to the provider; TraceBug never sees your key, your prompt, or the response.",
  openGraph: {
    title: "TraceBug AI Debugger — Private, BYO-Key LLM Analysis",
    description:
      "The privacy-preserving counterpart to cloud AI debuggers. Your key stays in localStorage, the prompt is scrubbed, and the request never touches a TraceBug backend.",
  },
};

export default function AiDebuggerDocsPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-border text-text-muted text-sm mb-4">
              <span className="w-2 h-2 rounded-full bg-accent"></span>
              Documentation · AI Debugger
            </div>
            <h1 className="text-4xl font-bold text-text-primary mb-4">
              BYO-Key LLM Analysis
            </h1>
            <p className="text-text-muted text-lg leading-relaxed">
              TraceBug can run LLM-powered root-cause analysis on a bug report
              using{" "}
              <strong className="text-text-primary">your own API key</strong> —
              Anthropic, OpenAI, or a local Ollama. The call goes{" "}
              <strong className="text-text-primary">
                directly from the browser to the provider
              </strong>
              ; TraceBug never sees your key, your prompt, or the response.
            </p>
          </div>

          {/* The differentiator callout */}
          <div className="bg-surface border border-accent/30 rounded-xl p-6 mb-12">
            <h3 className="text-text-primary font-semibold mb-2">
              🔒 AI debugging that never phones home
            </h3>
            <p className="text-text-muted text-sm leading-relaxed">
              This is the privacy-preserving counterpart to competitors&apos;
              cloud AI debuggers. Combined with the local heuristic hint and the{" "}
              <a
                href="/docs/mcp"
                className="text-accent hover:text-accent/80 transition-colors"
              >
                local MCP server
              </a>
              , it completes the story. No metered credits, no vendor cloud in
              the path.
            </p>
          </div>

          {/* Table of Contents */}
          <div className="bg-surface border border-border rounded-xl p-6 mb-12">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
              On this page
            </h2>
            <ul className="space-y-2">
              {[
                { href: "#setup", label: "Setup" },
                { href: "#providers", label: "Providers & models" },
                { href: "#sent", label: "What gets sent" },
                { href: "#privacy", label: "Privacy properties" },
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

          {/* Setup */}
          <section id="setup" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                1
              </span>
              Setup
            </h2>
            <div className="space-y-4 mb-6">
              {[
                { step: "1", text: "Open a report in the Quick Bug modal and go to the AI tab." },
                { step: "2", text: "Click Configure API key." },
                { step: "3", text: "Pick a provider, paste your key (not needed for Ollama), optionally change the model, and Save." },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex items-start gap-4 p-4 bg-surface border border-border rounded-lg"
                >
                  <span className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0 mt-0.5">
                    {item.step}
                  </span>
                  <p className="text-text-muted text-sm leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
            <p className="text-text-muted text-sm leading-relaxed">
              The key is stored only in this browser&apos;s{" "}
              <code className="text-primary bg-surface px-1 rounded">
                localStorage
              </code>{" "}
              under{" "}
              <code className="text-primary bg-surface px-1 rounded text-xs">
                tracebug_ai_config
              </code>
              . Removing it (
              <strong className="text-text-primary">Change key → Remove key</strong>
              ) deletes it.
            </p>
          </section>

          {/* Providers */}
          <section id="providers" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                2
              </span>
              Providers &amp; models
            </h2>
            <div className="space-y-4">
              {[
                {
                  name: "Anthropic",
                  models: "claude-haiku-4-5 (fast/cheap), claude-sonnet-4-6 (balanced, default), claude-opus-4-8 (most capable)",
                  note: "Called via the Messages API with the browser direct-access header.",
                },
                {
                  name: "OpenAI",
                  models: "any chat model, e.g. gpt-4o, gpt-4o-mini",
                  note: "Chat Completions API.",
                },
                {
                  name: "Ollama",
                  models: "any local tag, e.g. llama3.1",
                  note: "Runs entirely on your machine. Start Ollama with browser CORS allowed (OLLAMA_ORIGINS=*).",
                },
              ].map((p) => (
                <div key={p.name} className="p-4 bg-surface border border-border rounded-lg">
                  <h3 className="text-text-primary font-semibold text-sm mb-1">{p.name}</h3>
                  <p className="text-text-muted text-xs leading-relaxed mb-1">
                    <span className="text-accent font-semibold">Models:</span>{" "}
                    <code className="text-primary bg-background px-1 rounded text-xs">
                      {p.models}
                    </code>
                  </p>
                  <p className="text-text-muted text-xs leading-relaxed">{p.note}</p>
                </div>
              ))}
            </div>
            <p className="text-text-muted text-sm mt-4 leading-relaxed">
              The model field is free-text — put whatever your key/host supports.
            </p>
          </section>

          {/* What gets sent */}
          <section id="sent" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                3
              </span>
              What gets sent
            </h2>
            <p className="text-text-muted mb-4 leading-relaxed">
              Clicking{" "}
              <strong className="text-text-primary">Generate AI analysis</strong>{" "}
              sends the same structured prompt the &quot;copy prompt&quot; flow
              produces (title, summary, environment, root-cause hint, repro
              steps, console errors, network failures) —{" "}
              <strong className="text-text-primary">after</strong> it&apos;s
              scrubbed of secret token shapes (JWTs, Bearer tokens,{" "}
              <code className="text-primary bg-surface px-1 rounded text-xs">
                sk-…
              </code>{" "}
              keys, etc.) by the same sanitizer used before any cloud share.
              Screenshots and video are never sent.
            </p>
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-text-muted text-sm leading-relaxed">
                The model is asked to return concise markdown with five sections:{" "}
                <strong className="text-text-primary">Root cause</strong>,{" "}
                <strong className="text-text-primary">Evidence</strong>,{" "}
                <strong className="text-text-primary">Where to look</strong>,{" "}
                <strong className="text-text-primary">Suggested fix</strong>{" "}
                (with a code sketch), and{" "}
                <strong className="text-text-primary">Edge cases to test</strong>.
              </p>
            </div>
          </section>

          {/* Privacy */}
          <section id="privacy" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6">
              Privacy properties
            </h2>
            <ul className="space-y-3">
              {[
                <>
                  <strong className="text-text-primary">Direct browser → provider.</strong>{" "}
                  No TraceBug backend is involved; the request never touches our
                  servers.
                </>,
                <>
                  <strong className="text-text-primary">Key stays local.</strong>{" "}
                  It lives in{" "}
                  <code className="text-primary bg-background px-1 rounded text-xs">
                    localStorage
                  </code>
                  , is sent only in the request to the provider you chose, and is
                  removable in one click.
                </>,
                <>
                  <strong className="text-text-primary">Prompt is scrubbed.</strong>{" "}
                  Token shapes are redacted before the prompt leaves the page.
                </>,
                <>
                  <strong className="text-text-primary">You pay the provider directly.</strong>{" "}
                  No TraceBug metering, no per-analysis credits.
                </>,
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-text-muted text-sm leading-relaxed">
                  <span className="text-success flex-shrink-0 mt-0.5">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* SDK */}
          <section id="sdk" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6">
              Programmatic use (SDK)
            </h2>
            <div className="code-block p-5 rounded-xl overflow-x-auto mb-4">
              <pre className="text-sm font-mono text-text-primary leading-relaxed">
{`import { setAIConfig, runLLMAnalysis, generateReport } from "tracebug-sdk";

setAIConfig({ provider: "anthropic", apiKey: "sk-ant-…", model: "claude-sonnet-4-6" });

const report = generateReport();
const { text, model, usage } = await runLLMAnalysis(report);
console.log(text); // markdown analysis`}
              </pre>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">
              <code className="text-primary bg-surface px-1 rounded">
                runLLMAnalysis(report, {"{ signal }"})
              </code>{" "}
              accepts an{" "}
              <code className="text-primary bg-surface px-1 rounded">
                AbortSignal
              </code>
              .{" "}
              <code className="text-primary bg-surface px-1 rounded">
                buildAnalysisPrompt(report)
              </code>{" "}
              returns the scrubbed prompt string if you want to send it yourself.
            </p>
          </section>

          {/* CTA */}
          <div className="bg-surface border border-border rounded-xl p-8 text-center">
            <h2 className="text-xl font-bold text-text-primary mb-2">
              Your key, your provider, your bill
            </h2>
            <p className="text-text-muted text-sm">
              Open a report&apos;s AI tab, configure a key once, and get
              structured root-cause analysis — without your data leaving the page
              for anywhere but the provider you chose.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
