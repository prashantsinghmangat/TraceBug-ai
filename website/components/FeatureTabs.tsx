"use client";

import { useState } from "react";
import {
  Camera, PenLine, TerminalSquare, Video, ShieldCheck, Sparkles, type LucideIcon,
} from "lucide-react";
import Shortcut from "@/components/Keycap";

// "One tool, every piece of the bug": a feature list on the left, a live
// preview on the right that changes with the selected row. Click or keyboard
// only — nothing auto-advances. Every feature here ships in the extension
// today; keep it that way.

type Id = "capture" | "annotate" | "logs" | "record" | "private" | "ai";

const FEATURES: { id: Id; Icon: LucideIcon; title: string; body: React.ReactNode }[] = [
  {
    id: "capture",
    Icon: Camera,
    title: "Capture in one keypress",
    body: <>Click Capture Bug and reproduce it: clicks, console and network are recorded. Or press <Shortcut /> for an instant screenshot ticket.</>,
  },
  {
    id: "annotate",
    Icon: PenLine,
    title: "Annotate and blur",
    body: "Draw, add text and blur anything private on the screenshot before it leaves your machine.",
  },
  {
    id: "logs",
    Icon: TerminalSquare,
    title: "Console and network, already recorded",
    body: "Errors with stack traces and the failed requests are in the report. No one opens DevTools.",
  },
  {
    id: "record",
    Icon: Video,
    title: "Video and voice notes",
    body: "Record the tab when steps are hard to write down, and talk through what you expected.",
  },
  {
    id: "private",
    Icon: ShieldCheck,
    title: "Private by design",
    body: "Passwords and tokens in typed fields are masked. Nothing is uploaded; there's no server to upload to.",
  },
  {
    id: "ai",
    Icon: Sparkles,
    title: "Debug with your AI agent",
    body: "Claude Code, Cursor or Windsurf read the report over MCP and go straight to the cause.",
  },
];

export default function FeatureTabs() {
  const [active, setActive] = useState<Id>("capture");

  return (
    <section id="features" className="border-t border-border bg-surface/60 py-section">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="mb-4 inline-flex font-mono text-[13px] text-text-subtle">Features</span>
          <h2 className="text-h3 font-medium text-text-primary">One tool. Every piece of the bug.</h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[5fr_7fr] lg:gap-12">
          <div role="tablist" aria-orientation="vertical" className="flex flex-col">
            {FEATURES.map(({ id, Icon, title, body }) => {
              const on = id === active;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={on}
                  aria-controls="feature-preview"
                  onClick={() => setActive(id)}
                  className={`group relative border-l-2 py-3.5 pl-5 pr-2 text-left transition-colors ${
                    on ? "border-primary" : "border-border hover:border-border-strong"
                  }`}
                >
                  <span className={`flex items-center gap-3 text-[17px] font-medium ${on ? "text-text-primary" : "text-text-subtle group-hover:text-text-primary"}`}>
                    <Icon size={18} strokeWidth={1.5} className={on ? "text-primary" : ""} />
                    {title}
                  </span>
                  {on && (
                    <span className="mt-2 block animate-fade-in pl-[30px] text-[15px] leading-[1.6] text-text-muted">
                      {body}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div id="feature-preview" role="tabpanel" className="min-w-0">
            <Browser>
              <div key={active} className="animate-fade-in">
                <Preview id={active} />
              </div>
            </Browser>
          </div>
        </div>
      </div>
    </section>
  );
}

function Browser({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-float">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <i className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <i className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        </span>
        <span className="ml-2 flex-1 truncate rounded-md bg-background px-3 py-1 font-mono text-[12px] text-text-subtle">
          app.example.com/checkout
        </span>
      </div>
      {/* On phones the scene is drawn at desktop size and scaled down, so the
          floating cards keep their place instead of covering the page. */}
      <div className="relative h-[250px] overflow-hidden min-[440px]:h-[300px] sm:h-[400px]">
        <div className="absolute left-0 top-0 h-[400px] w-[540px] origin-top-left scale-[0.62] p-6 min-[440px]:scale-[0.75] sm:static sm:h-full sm:w-auto sm:scale-100">
          {children}
        </div>
      </div>
    </div>
  );
}

// The page under test, shared by most previews.
// `annotated` draws the two annotation marks on the elements themselves (a
// blur over the card number, a box around the button), so they stay aligned
// however the card lays out.
function Checkout({ masked = false, annotated = false }: { masked?: boolean; annotated?: boolean }) {
  return (
    <div className="max-w-[340px] rounded-xl border border-border bg-background p-5">
      <div className="text-[16px] font-medium text-text-primary">Checkout</div>
      <div className="mt-4 space-y-2.5 text-[13px]">
        <Field label="Email" value={masked ? "r•••@•••••.com" : "riya@example.com"} />
        <Field label="Card" value={masked ? "•••• •••• •••• ••••" : "4242 4242 4242 4242"} blurred={annotated} />
        <Field label="Coupon" value="SPRING25" />
      </div>
      <div className="relative mt-4 inline-flex h-9 items-center rounded-lg bg-text-primary px-4 text-[13px] font-medium text-background">
        Place order
        {annotated && <span aria-hidden className="pointer-events-none absolute -inset-[7px] rounded-xl border-2 border-error" />}
      </div>
    </div>
  );
}

function Field({ label, value, blurred = false }: { label: string; value: string; blurred?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2">
      <span className="text-text-subtle">{label}</span>
      <span className="relative font-mono text-[12px] text-text-primary">
        {value}
        {blurred && <span aria-hidden className="absolute -inset-x-1.5 -inset-y-1 rounded bg-text-subtle/30 backdrop-blur-[3px]" />}
      </span>
    </div>
  );
}

function Preview({ id }: { id: Id }) {
  switch (id) {
    case "capture":
      return (
        <>
          <Checkout />
          <div className="absolute right-6 top-6 w-[220px] rounded-xl border border-border bg-background p-4 shadow-float">
            <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
              <span className="h-2 w-2 rounded-full bg-success" /> Report captured
            </div>
            <ul className="mt-3 space-y-1.5 text-[12px] text-text-muted">
              <li>✓ Screenshot</li>
              <li>✓ 4 steps</li>
              <li>✓ 1 console error</li>
              <li>✓ 1 failed request</li>
              <li>✓ Chrome 131 · Windows 11</li>
            </ul>
          </div>
          <div className="absolute bottom-6 right-6 flex items-center gap-2 text-[12px] text-text-subtle">
            <Shortcut /> pressed
          </div>
        </>
      );
    case "annotate":
      return (
        <>
          <Checkout annotated />
          <div className="absolute left-[172px] top-[226px] rotate-[-4deg] whitespace-nowrap font-mono text-[14px] font-medium text-error">
            ← nothing happens on click
          </div>
          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-1 rounded-xl border border-border bg-background p-1.5 shadow-float">
            {["Pen", "Box", "Arrow", "Text", "Blur"].map((t, i) => (
              <span
                key={t}
                className={`rounded-md px-3 py-1.5 text-[12px] ${i === 1 ? "bg-text-primary text-background" : "text-text-muted"}`}
              >
                {t}
              </span>
            ))}
          </div>
        </>
      );
    case "logs":
      return (
        <div className="space-y-4 font-mono text-[12px]">
          <div>
            <div className="mb-2 font-sans text-[12px] text-text-subtle">Console · 1 error</div>
            <div className="rounded-lg border border-error/20 bg-error/[0.05] p-3">
              <div className="text-error">TypeError: Cannot read properties of undefined (reading &apos;total&apos;)</div>
              <div className="mt-1.5 text-text-subtle">at applyCoupon (checkout/cart.ts:88:21)</div>
              <div className="text-text-subtle">at onSubmit (checkout/page.tsx:41:9)</div>
            </div>
          </div>
          <div>
            <div className="mb-2 font-sans text-[12px] text-text-subtle">Network · 3 requests</div>
            <div className="overflow-hidden rounded-lg border border-border">
              {[
                ["GET", "/api/cart", "200", "88ms"],
                ["POST", "/api/coupon", "200", "112ms"],
                ["POST", "/api/orders", "500", "203ms"],
              ].map(([m, u, s, d], i) => (
                <div
                  key={u}
                  className={`flex gap-3 px-3 py-2 ${i ? "border-t border-border" : ""} ${s === "500" ? "bg-error/[0.05]" : ""}`}
                >
                  <span className="w-10 text-text-muted">{m}</span>
                  <span className="flex-1 truncate text-text-primary">{u}</span>
                  <span className={s === "500" ? "text-error" : "text-text-muted"}>{s}</span>
                  <span className="w-12 text-right text-text-subtle">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    case "record":
      return (
        <>
          <Checkout />
          <div className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-background py-1.5 pl-3 pr-1.5 shadow-float">
            <span className="h-2.5 w-2.5 rounded-full bg-error" />
            <span className="font-mono text-[12px] tabular-nums text-text-primary">00:12</span>
            <span className="rounded-full bg-text-primary px-3 py-1 text-[12px] font-medium text-background">Stop</span>
          </div>
          <div className="absolute bottom-6 right-6 w-[230px] rounded-xl border border-border bg-background p-4 shadow-float">
            <div className="text-[12px] font-medium text-text-primary">Voice note</div>
            <div className="mt-3 flex h-8 items-end gap-[3px]" aria-hidden="true">
              {[6, 14, 22, 12, 28, 18, 9, 24, 30, 16, 8, 20, 26, 12, 6, 18, 22, 10].map((h, i) => (
                <span key={i} className="w-[4px] rounded-full bg-primary/70" style={{ height: h }} />
              ))}
            </div>
            <div className="mt-2 text-[12px] italic text-text-muted">“Coupon applied, then the total vanished…”</div>
          </div>
        </>
      );
    case "private":
      return (
        <>
          <Checkout masked />
          <div className="absolute bottom-6 right-6 w-[240px] rounded-xl border border-border bg-background p-4 shadow-float">
            <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
              <ShieldCheck size={16} strokeWidth={1.5} className="text-success" /> Privacy
            </div>
            <ul className="mt-2.5 space-y-1.5 text-[12px] text-text-muted">
              <li>2 fields masked</li>
              <li>Tokens scrubbed from URLs</li>
              <li>Hidden inputs skipped</li>
              <li className="text-text-primary">0 bytes uploaded</li>
            </ul>
          </div>
        </>
      );
    case "ai":
      return (
        <div className="absolute inset-0 bg-band p-6 font-mono text-[12px] leading-[1.9] text-band-text/80">
          <div className="text-band-text/50">Claude Code · via MCP</div>
          <div className="mt-3"><span className="text-band-text">›</span> fix the checkout bug from my last TraceBug report</div>
          <div className="mt-2 text-[#FF5C6C]">● get_bug_report</div>
          <div className="text-[#FF5C6C]">● get_console_errors</div>
          <div className="text-[#FF5C6C]">● get_network_activity</div>
          <div className="mt-2 text-band-text">
            POST /api/orders returned 500, then applyCoupon read <span className="text-[#E5484D]">total</span> from an empty
            response.
          </div>
          <div className="mt-2 text-band-text/60">checkout/cart.ts:88</div>
          <div className="text-[#E5484D]">- const total = res.data.total;</div>
          <div className="text-[#4CC38A]">+ if (!res.ok) return showError(res);</div>
          <div className="text-[#4CC38A]">+ const total = res.data.total;</div>
        </div>
      );
  }
}
