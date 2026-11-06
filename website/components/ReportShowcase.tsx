"use client";

import { useState } from "react";
import {
  Bug, MousePointerClick, Network, AlertOctagon, Camera, Compass, Monitor, Sparkles,
} from "lucide-react";
import PageMascot from "@/components/PageMascot";

// One report, shown big — drawn to match the real exported .html viewer
// (src/exporters/html-template.ts): header with auto severity and the issue
// actions, the replay/screenshot with its scrubber on the left, the summary
// and the Info · Console · Network · Actions · AI · Events tabs on the right,
// and the footer line. The tabs here are clickable, like the real ones.
// Keep this in step with the exporter when its layout changes.

type Tab = "info" | "console" | "network" | "actions" | "ai" | "events";

const TABS: { id: Tab; label: string; count?: number }[] = [
  { id: "info", label: "Info" },
  { id: "console", label: "Console", count: 1 },
  { id: "network", label: "Network", count: 2 },
  { id: "actions", label: "Actions", count: 4 },
  { id: "ai", label: "AI" },
  { id: "events", label: "Events", count: 6 },
];

const INFO = [
  ["URL", "app.example.com/vendor"],
  ["OS", "Windows 11"],
  ["Browser", "Chrome 131"],
  ["Viewport", "1920 × 1080"],
  ["Severity (auto)", "high"],
  ["Captured", "clicks · console · network · screenshot"],
];

const NETWORK = [
  { m: "GET", url: "/api/vendor/123", s: 200, d: "124ms" },
  { m: "POST", url: "/api/vendor/update", s: 500, d: "89ms" },
];

const ACTIONS = [
  <>Navigated to <code className="font-mono text-text-primary">/vendor</code></>,
  <>Clicked <span className="font-medium text-text-primary">“Edit”</span> <span className="font-mono text-[12px] text-text-subtle">#vendor-edit-btn</span></>,
  <>Selected Status <span className="font-medium text-text-primary">“Inactive”</span></>,
  <>Clicked <span className="font-medium text-text-primary">“Update”</span> <span className="font-mono text-[12px] text-text-subtle">button[type=submit]</span></>,
];

const EVENTS = [
  { t: "00:00", tone: "nav", label: "navigate  /vendor" },
  { t: "00:01", label: 'click  "Edit"' },
  { t: "00:02", label: 'select  Status → "Inactive"' },
  { t: "00:03", label: 'click  "Update"' },
  { t: "00:03", tone: "error", label: "POST /api/vendor/update  500" },
  { t: "00:03", tone: "error", label: "TypeError: Cannot read 'status'" },
];

const CAPTURED = [
  { Icon: MousePointerClick, label: "Clicks and typing" },
  { Icon: AlertOctagon, label: "Console errors and stacks" },
  { Icon: Network, label: "Network requests" },
  { Icon: Camera, label: "Annotated screenshots" },
  { Icon: Compass, label: "Navigation" },
  { Icon: Monitor, label: "Environment" },
];

export default function ReportShowcase() {
  const [tab, setTab] = useState<Tab>("console");

  return (
    <section id="report" className="py-section">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="mb-4 inline-flex font-mono text-[13px] text-text-subtle">The report</span>
          <h2 className="text-h2 font-medium text-text-primary">
            One report. Complete debugging evidence.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lead text-text-muted">
            Instead of “the page is broken”, the developer gets the steps, the error, the request and the
            environment, in one <code className="font-mono text-[0.9em] text-text-primary">.html</code> file that
            opens offline.
          </p>
        </div>

        <div className="relative mt-12 lg:mt-16">
          {/* the character, standing on the report and pointing into it */}
          <PageMascot
            size={150}
            pose="investigate"
            className="pointer-events-none absolute -top-[134px] right-6 hidden -scale-x-100 lg:block"
          />

          <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-float">
            {/* window chrome: it's a file opened in the browser */}
            <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
              <span className="flex gap-1.5" aria-hidden="true">
                <i className="h-2.5 w-2.5 rounded-full bg-border-strong" />
                <i className="h-2.5 w-2.5 rounded-full bg-border-strong" />
                <i className="h-2.5 w-2.5 rounded-full bg-border-strong" />
              </span>
              <span className="ml-2 truncate font-mono text-[12px] text-text-subtle">
                file:///Downloads/tracebug-vendor-update.html
              </span>
            </div>

            {/* header — title, auto severity, issue actions, meta */}
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Bug size={18} strokeWidth={1.5} className="shrink-0 text-text-subtle" />
                <h3 className="min-w-0 text-[16px] font-medium text-text-primary">
                  Vendor update fails with a TypeError
                </h3>
                <span className="rounded-full border border-warning/50 bg-warning/10 px-2.5 py-0.5 text-[11px] font-medium text-warning">
                  High
                </span>
                <span className="ml-auto hidden gap-2 sm:flex">
                  <HeaderBtn>Copy issue markdown</HeaderBtn>
                  <HeaderBtn>Open GitHub issue</HeaderBtn>
                </span>
              </div>
              <div className="mt-1.5 truncate font-mono text-[12px] text-text-subtle">
                Session 3f9a2c1e · Page /vendor · Chrome 131 · Windows 11
              </div>
            </div>

            <div className="grid lg:grid-cols-[1.1fr_1fr]">
              {/* left: replay */}
              <div className="min-w-0 border-b border-border p-5 sm:p-6 lg:border-b-0 lg:border-r">
                <h4 className="mb-3 text-[13px] font-medium text-text-subtle">Replay</h4>
                <ScreenshotMock />
                <Scrubber />
              </div>

              {/* right: summary + tabs */}
              <div className="min-w-0 p-5 sm:p-6">
                <p className="rounded-lg border border-border bg-surface/60 px-4 py-3 text-[14px] leading-[1.55] text-text-primary">
                  Clicking “Update” sent <span className="font-mono text-[13px]">POST /api/vendor/update</span>,
                  which returned <span className="font-mono text-[13px] text-error">500</span>; a{" "}
                  <span className="font-mono text-[13px]">TypeError</span> followed in the console.
                </p>

                <div role="tablist" className="mt-4 flex gap-0.5 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      role="tab"
                      aria-selected={tab === t.id}
                      onClick={() => setTab(t.id)}
                      className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2 text-[13px] transition-colors ${
                        tab === t.id
                          ? "border-primary text-text-primary"
                          : "border-transparent text-text-subtle hover:text-text-primary"
                      }`}
                    >
                      {t.label}
                      {t.count ? (
                        <span
                          className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                            tab === t.id ? "bg-primary text-white" : "bg-surface-2 text-text-muted"
                          }`}
                        >
                          {t.count}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>

                <div className="min-h-[236px] pt-4" role="tabpanel">
                  <TabPanel tab={tab} />
                </div>
              </div>
            </div>

            {/* the real footer line every export carries */}
            <div className="border-t border-border bg-surface px-5 py-3 text-[12px] text-text-subtle sm:px-6">
              Captured with TraceBug — free &amp; local. · opens fully offline
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[13px] text-text-subtle">
          Illustration of an exported report. From the extension you can also copy it as a GitHub issue, Jira
          ticket, PDF or JSON.
        </p>

        {/* what's in every report, as quiet proof points */}
        <ul className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3 text-[14px] text-text-muted">
          {CAPTURED.map(({ Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-2">
              <Icon size={16} strokeWidth={1.5} className="text-text-subtle" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TabPanel({ tab }: { tab: Tab }) {
  switch (tab) {
    case "info":
      return (
        <dl className="divide-y divide-border text-[13px]">
          {INFO.map(([k, v]) => (
            <div key={k} className="flex gap-4 py-2">
              <dt className="w-32 shrink-0 text-text-subtle">{k}</dt>
              <dd className="min-w-0 truncate font-mono text-text-primary">{v}</dd>
            </div>
          ))}
        </dl>
      );
    case "console":
      return (
        <div className="rounded-lg border border-error/20 bg-error/[0.04] p-4 font-mono text-[13px]">
          <div className="text-error">TypeError</div>
          <div className="mt-1 text-text-primary">Cannot read properties of undefined (reading &apos;status&apos;)</div>
          <div className="mt-2 space-y-0.5 text-text-subtle">
            <div>at updateVendor (vendor/page.tsx:42:18)</div>
            <div>at handleSubmit (vendor/page.tsx:67:5)</div>
          </div>
        </div>
      );
    case "network":
      return (
        <div className="overflow-hidden rounded-lg border border-border font-mono text-[13px]">
          {NETWORK.map((n, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-border" : ""} ${n.s >= 400 ? "bg-error/[0.04]" : ""}`}
            >
              <span className="w-11 text-text-muted">{n.m}</span>
              <span className="flex-1 truncate text-text-primary">{n.url}</span>
              <span className={`tabular-nums ${n.s >= 400 ? "text-error" : "text-text-muted"}`}>{n.s}</span>
              <span className="w-12 text-right tabular-nums text-text-subtle">{n.d}</span>
            </div>
          ))}
        </div>
      );
    case "actions":
      return (
        <ol className="space-y-2.5">
          {ACTIONS.map((s, i) => (
            <li key={i} className="flex gap-3 text-[14px] leading-[1.5] text-text-muted">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-2 font-mono text-[12px]">
                {i + 1}
              </span>
              <span className="min-w-0">{s}</span>
            </li>
          ))}
        </ol>
      );
    case "ai":
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
              <Sparkles size={14} strokeWidth={1.5} className="text-primary" />
              Pattern-based hint
              <span className="rounded-full bg-surface-2 px-2 font-mono text-[11px] font-normal text-text-muted">high</span>
            </div>
            <p className="mt-2 text-[14px] leading-[1.55] text-text-muted">
              The server returned 500 for <span className="font-mono text-[13px] text-text-primary">POST /api/vendor/update</span>{" "}
              and the code then read <span className="font-mono text-[13px] text-text-primary">status</span> from a missing
              response body.
            </p>
          </div>
          <p className="text-[13px] leading-[1.55] text-text-subtle">
            Plus a ready prompt for Claude Code, Cursor or Windsurf to read this file over MCP.
          </p>
        </div>
      );
    case "events":
      return (
        <ul className="space-y-1 font-mono text-[13px]">
          {EVENTS.map((e, i) => (
            <li key={i} className="flex items-center gap-3 leading-6">
              <span className="w-11 shrink-0 tabular-nums text-text-subtle">{e.t}</span>
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  e.tone === "error" ? "bg-error" : e.tone === "nav" ? "bg-primary" : "bg-border-strong"
                }`}
              />
              <span className={`truncate whitespace-pre ${e.tone === "error" ? "text-error" : "text-text-primary"}`}>
                {e.label}
              </span>
            </li>
          ))}
        </ul>
      );
  }
}

// A small drawn screenshot of the broken form, with the tester's annotation.
function ScreenshotMock() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-surface/60 p-4" aria-hidden="true">
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="text-[13px] font-medium text-text-primary">Edit vendor</div>
        <div className="mt-3 space-y-2">
          <div className="h-8 rounded-md border border-border bg-surface" />
          <div className="flex h-8 items-center rounded-md border border-border bg-surface px-3 text-[12px] text-text-muted">
            Status: Inactive
          </div>
        </div>
        <div className="relative mt-3 inline-flex">
          <span className="inline-flex h-8 items-center rounded-md bg-text-primary px-3 text-[12px] font-medium text-background">
            Update
          </span>
          <span className="absolute -inset-2 rounded-lg border-2 border-error" />
        </div>
        <span className="ml-5 align-middle font-mono text-[12px] text-error">nothing happens here</span>
      </div>
    </div>
  );
}

// The replay scrubber: time, "Jump to error", and the error marker on the track.
function Scrubber() {
  return (
    <div className="mt-4" aria-hidden="true">
      <div className="flex items-center gap-3 text-[12px]">
        <span className="font-medium text-text-subtle">Replay</span>
        <span className="font-mono tabular-nums text-text-subtle">00:03 / 00:04</span>
        <span className="ml-auto rounded-md border border-error/30 px-2 py-0.5 text-error">Jump to error</span>
      </div>
      <div className="relative mt-2 h-1.5 rounded-full bg-surface-2">
        <div className="h-full w-[78%] rounded-full bg-primary" />
        <span className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-error" style={{ left: "80%" }} />
        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background" style={{ left: "78%" }} />
      </div>
    </div>
  );
}

function HeaderBtn({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-text-muted">
      {children}
    </span>
  );
}
