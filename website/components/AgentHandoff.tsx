"use client";

import { useState } from "react";
import Link from "next/link";
import SectionHeading from "@/components/SectionHeading";
import { Check, Copy, FileCode2, TerminalSquare, Wrench, ShieldCheck, ArrowRight } from "lucide-react";

// The MCP hand-off is TraceBug's sharpest wedge: a bug report your AI coding
// agent reads directly and fixes from — no copy-paste, no screenshots-into-chat,
// nothing uploaded. This section sells that on the homepage; deep docs at /docs/mcp.

const MCP_CMD = "claude mcp add tracebug -- npx -y tracebug mcp";

const AGENTS = ["Claude Code", "Cursor", "Windsurf", "VS Code"];

const STEPS = [
  {
    Icon: FileCode2,
    label: "Export",
    desc: "Capture the bug and click Export .html — one self-contained report lands in your Downloads.",
  },
  {
    Icon: TerminalSquare,
    label: "Connect",
    desc: "Register the local MCP server once (command below). It auto-discovers reports — no path setup.",
  },
  {
    Icon: Wrench,
    label: "Fix",
    desc: "Your agent reads the console, network, repro steps, and screenshots — then fixes it in your code.",
  },
];

export default function AgentHandoff() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(MCP_CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section id="mcp" className="py-20 lg:py-28 border-y border-border bg-surface/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Model Context Protocol"
          title="Hand the bug straight to your AI coding agent"
          subtitle={
            <>
              TraceBug exports are <strong className="text-text-primary">agent-ready</strong>. Point Claude
              Code, Cursor, or any MCP client at the report — it reads the console, network, repro steps, and
              screenshots, then fixes the bug in your codebase. Fully local; nothing is uploaded.
            </>
          }
          className="mb-12"
        />

        {/* The command — the hero of the section */}
        <div className="max-w-2xl mx-auto mb-14">
          <div className="relative group gradient-border rounded-2xl">
            <pre className="code-block overflow-x-auto p-4 pr-12 text-text-primary">
              <code>
                <span className="text-text-subtle select-none">$ </span>
                {MCP_CMD}
              </code>
            </pre>
            <button
              onClick={copy}
              aria-label="Copy command"
              className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-text-subtle hover:text-primary hover:border-primary/40 transition-colors"
            >
              {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="mt-3 text-center text-[12.5px] text-text-subtle">
            One-time setup. No <code className="font-mono text-text-muted">--dir</code> needed — the server
            auto-finds reports in your Downloads/Desktop.
          </p>
        </div>

        {/* Three steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {STEPS.map(({ Icon, label, desc }, i) => (
            <div key={label} className="relative">
              <div className="group card-rise h-full rounded-2xl border border-border bg-background p-6 hover:border-primary/30 hover:shadow-card-hover">
                <div className="flex items-center gap-3 mb-4">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/[0.08] text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    <Icon size={18} />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-text-subtle">
                    Step {i + 1}
                  </span>
                </div>
                <h3 className="text-[16px] font-semibold text-text-primary mb-1.5">{label}</h3>
                <p className="text-[13.5px] text-text-muted leading-relaxed">{desc}</p>
              </div>
              {i < STEPS.length - 1 && (
                <span className="hidden md:flex absolute top-1/2 -right-2.5 -translate-y-1/2 z-10 h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-text-subtle">
                  <ArrowRight size={13} />
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Works-with + privacy + docs link */}
        <div className="mt-10 flex flex-col items-center gap-5">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-[12.5px] text-text-subtle mr-1">Works with</span>
            {AGENTS.map((a) => (
              <span
                key={a}
                className="rounded-full border border-border bg-background px-3 py-1 text-[12.5px] font-medium text-text-muted"
              >
                {a}
              </span>
            ))}
            <span className="text-[12.5px] text-text-subtle">& any MCP client</span>
          </div>
          <div className="inline-flex items-center gap-2 text-[13px] text-text-muted">
            <ShieldCheck size={15} className="text-success" />
            Runs on your machine over stdio — zero network calls, nothing uploaded.
          </div>
          <Link
            href="/docs/mcp"
            className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Read the MCP docs
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
