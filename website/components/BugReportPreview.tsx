import SectionHeading from "@/components/SectionHeading";
import { GitHubIcon } from "@/components/ui/brand-icons";
import { FileText, FileJson, Bug } from "lucide-react";

const ENV = [
  ["Browser", "Chrome 121.0.6167.85"],
  ["OS", "Windows 11 Pro"],
  ["Viewport", "1920 × 1080"],
  ["Device", "Desktop"],
  ["Connection", "4G — fast"],
  ["Page", "/vendor"],
  ["Events", "6 captured"],
  ["Errors", "1 critical"],
];

const STEPS = [
  <>Navigate to <code className="font-mono text-text-primary">/vendor</code></>,
  <>Click <span className="text-text-primary font-medium">“Edit”</span> button (role=button, id=vendor-edit-btn)</>,
  <>Select <span className="text-text-primary font-medium">“Inactive”</span> from Status dropdown (was: “Active”)</>,
  <>Click <span className="text-text-primary font-medium">“Update”</span> button (type=submit)</>,
  <>Observe <span className="text-error font-medium">TypeError thrown</span> in browser console</>,
];

const NETWORK = [
  { m: "GET", url: "/api/vendor/123", s: 200, d: "124ms", t: "+0.3s" },
  { m: "POST", url: "/api/vendor/update", s: 500, d: "89ms", t: "+3.5s" },
];

const TIMELINE = [
  { t: "+0.0s", i: "→", c: "text-accent", label: "navigate: / → /vendor" },
  { t: "+1.2s", i: "●", c: "text-text-muted", label: 'click: button "Edit" [id=vendor-edit-btn]' },
  { t: "+2.1s", i: "◆", c: "text-primary", label: 'select: Status: "Active" → "Inactive"' },
  { t: "+3.4s", i: "●", c: "text-text-muted", label: 'click: button "Update" [type=submit]' },
  { t: "+3.5s", i: "⟳", c: "text-warning", label: "api: POST /api/vendor/update → 500" },
  { t: "+3.5s", i: "✕", c: "text-error", label: "error: TypeError: Cannot read 'status'" },
];

export default function BugReportPreview() {
  return (
    <section className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Live preview"
          title={<>What a real <span className="gradient-text">TraceBug report</span> looks like</>}
          subtitle="An actual report generated from the demo “Vendor Update” bug — complete, structured, and ready for a developer."
          className="mb-14"
        />

        <div className="relative max-w-4xl mx-auto">
          <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-primary/10 to-accent/10 blur-2xl" />
          <div className="rounded-2xl border border-border bg-background shadow-card overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-border bg-surface">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-error/10 text-error flex-shrink-0">
                  <Bug size={18} />
                </span>
                <div>
                  <h3 className="text-[16px] font-semibold text-text-primary leading-snug">
                    Vendor Update Fails — TypeError
                  </h3>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-subtle font-mono">
                    <span>Reported: 2026-03-12 14:23:01</span>
                    <span>Session: tb_20260312_142301</span>
                    <span>Duration: 18s</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 grid lg:grid-cols-2 gap-6">
              {/* Environment */}
              <Block title="Environment">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {ENV.map(([k, v]) => (
                    <div key={k} className="flex flex-col">
                      <span className="text-[11px] text-text-subtle uppercase tracking-wider">{k}</span>
                      <span className="text-[12.5px] font-mono text-text-primary">{v}</span>
                    </div>
                  ))}
                </div>
              </Block>

              {/* Repro steps */}
              <Block title="Steps to reproduce">
                <ol className="space-y-2">
                  {STEPS.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] text-text-muted leading-relaxed">
                      <span className="flex-shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary text-[11px] font-semibold">
                        {i + 1}
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </Block>

              {/* Console error */}
              <Block title="Console errors">
                <div className="rounded-xl border border-error/20 bg-error/[0.04] p-3.5 font-mono text-[12px]">
                  <div className="text-error font-semibold mb-1">TypeError — Critical</div>
                  <div className="text-text-primary mb-2">Cannot read properties of undefined (reading 'status')</div>
                  <div className="text-text-subtle space-y-0.5">
                    <div>at updateVendor (vendor/page.tsx:42:18)</div>
                    <div>at handleSubmit (vendor/page.tsx:67:5)</div>
                    <div>at onClick (vendor/page.tsx:112:24)</div>
                  </div>
                </div>
              </Block>

              {/* Network */}
              <Block title="Network log">
                <div className="rounded-xl border border-border overflow-hidden font-mono text-[12px]">
                  {NETWORK.map((n, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 px-3 py-2 ${i > 0 ? "border-t border-border" : ""} ${n.s >= 400 ? "bg-error/[0.04]" : ""}`}
                    >
                      <span className="w-10 text-text-muted">{n.m}</span>
                      <span className="flex-1 truncate text-text-primary">{n.url}</span>
                      <span className={n.s >= 400 ? "text-error font-semibold" : "text-success"}>{n.s}</span>
                      <span className="text-text-subtle w-12 text-right">{n.d}</span>
                    </div>
                  ))}
                </div>
              </Block>

              {/* Timeline */}
              <Block title="Session timeline" className="lg:col-span-2">
                <div className="rounded-xl border border-border bg-surface p-4 font-mono text-[12px] space-y-2">
                  {TIMELINE.map((e, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-text-subtle tabular-nums w-12">{e.t}</span>
                      <span className={`${e.c} w-3 text-center`}>{e.i}</span>
                      <span className="text-text-primary/90">{e.label}</span>
                    </div>
                  ))}
                </div>
              </Block>
            </div>

            {/* Export bar */}
            <div className="px-6 py-4 border-t border-border bg-surface flex flex-wrap gap-2">
              <ExportBtn primary><GitHubIcon size={14} /> Copy GitHub Issue</ExportBtn>
              <ExportBtn>Copy Jira Ticket</ExportBtn>
              <ExportBtn><FileText size={14} /> Download PDF</ExportBtn>
              <ExportBtn><FileJson size={14} /> Download JSON</ExportBtn>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Block({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h4 className="text-[12px] font-semibold uppercase tracking-wider text-text-subtle mb-3">{title}</h4>
      {children}
    </div>
  );
}

function ExportBtn({ children, primary = false }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium border ${
        primary
          ? "bg-primary text-white border-transparent shadow-glow-sm"
          : "bg-background text-text-muted border-border"
      }`}
    >
      {children}
    </span>
  );
}
