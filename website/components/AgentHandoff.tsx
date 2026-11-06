"use client";

import { Logo } from "@/components/ui/logos";
import { MCP } from "@/lib/site";
import { useState } from "react";
import Link from "next/link";
import { Check, Copy, ArrowRight } from "lucide-react";

// The MCP hand-off: a report your AI coding agent reads directly — no
// copy-paste, nothing uploaded. The page's one dark section, so the technical
// part reads as a different room. Absorbs the MCP tab that used to live in the
// install section. Deep docs at /docs/mcp.

const SETUPS = [
  {
    key: "claude",
    label: "Claude Code",
    logos: ["claude"],
    code: MCP.claudeCode,
  },
  {
    key: "json",
    label: "Cursor · Windsurf · VS Code",
    logos: ["cursor", "windsurf", "vscode"],
    code: `{
  "mcpServers": {
    "tracebug": { "command": "npx", "args": ["-y", "tracebug", "mcp"] }
  }
}`,
  },
] as const;

const STEPS = [
  { label: "Export", desc: "Capture the bug and click Export .html. The report lands in your Downloads." },
  { label: "Connect", desc: "Add the local MCP server once. It finds reports in Downloads on its own." },
  { label: "Investigate", desc: "Ask your agent to debug it. It reads the console, network, steps and screenshots." },
];

export default function AgentHandoff() {
  const [tab, setTab] = useState<(typeof SETUPS)[number]["key"]>("claude");
  const [copied, setCopied] = useState(false);
  const active = SETUPS.find((s) => s.key === tab)!;

  const copy = () => {
    navigator.clipboard.writeText(active.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section id="mcp" className="bg-band py-section text-band-text dark:border-y dark:border-white/[0.08]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
        <div className="min-w-0 lg:col-span-5">
          <span className="mb-4 inline-flex font-mono text-[13px] text-[#7A8296]">Model Context Protocol</span>
          <h2 className="text-h2 font-medium">
            Give your AI agent the full context
          </h2>
          <p className="mt-4 text-lead text-[#A3A9B8]">
            Claude Code, Cursor and Windsurf read TraceBug reports through a local MCP server. Your agent
            investigates the real runtime evidence instead of your description of it.
          </p>
          <p className="mt-4 text-[14px] leading-[1.6] text-[#7A8296]">
            Runs on your machine over stdio. Nothing is uploaded.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px]">
            <Link href="/docs/mcp" className="group inline-flex items-center gap-1.5 font-medium text-[#B9BBFB]">
              Read the MCP docs
              <ArrowRight size={16} strokeWidth={1.5} className="transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
            <a href="/proof" className="text-[#A3A9B8] underline-offset-2 hover:text-white hover:underline">
              See a real transcript
            </a>
          </div>
        </div>

        <div className="min-w-0 lg:col-span-7">
          <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#11141C]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] px-2 py-2">
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="MCP client">
                {SETUPS.map((s) => (
                  <button
                    key={s.key}
                    role="tab"
                    aria-selected={tab === s.key}
                    onClick={() => { setTab(s.key); setCopied(false); }}
                    className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-[13px] transition-colors ${
                      tab === s.key ? "bg-white/[0.08] text-white" : "text-[#A3A9B8] hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {s.logos.map((l) => (
                        <Logo key={l} name={l} size={14} />
                      ))}
                    </span>
                    {s.label}
                  </button>
                ))}
              </div>
              <button
                onClick={copy}
                aria-label="Copy setup"
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] text-[#EEF0F5] transition-colors hover:bg-white/[0.08]"
              >
                {copied ? <Check size={14} className="text-[#4CC38A]" /> : <Copy size={14} strokeWidth={1.5} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="overflow-x-auto px-5 py-5 font-mono text-[14px] leading-7 text-[#EEF0F5]">
              <code>
                {tab === "claude" && <span className="select-none text-[#7A8296]">$ </span>}
                {active.code}
              </code>
            </pre>
          </div>

          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map(({ label, desc }, i) => (
              <li key={label}>
                <span className="font-mono text-[13px] text-[#7A8296]">0{i + 1}</span>
                <h3 className="mt-3 text-[16px] font-medium">{label}</h3>
                <p className="mt-1 text-[14px] leading-[1.6] text-[#A3A9B8]">{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
