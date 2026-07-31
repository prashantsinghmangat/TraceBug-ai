// ── Milestone email ask ───────────────────────────────────────────────────
// Shown ONCE ever, at the user's 5th saved ticket. An ASK, never a wall:
// every path — submit, "No thanks", ✕, Esc, or just ignoring it — leaves
// TraceBug fully functional forever, and the card never returns. This is the
// only surface in the product that mentions email, and the only thing it
// transmits is the address the user explicitly types.
//
// Values guardrails (do not weaken these):
//  - never blocks any feature; no "continue" coupling
//  - shows once per browser, marked done AT SHOW TIME (ignoring it counts)
//  - copy states explicitly that TraceBug works fully without it

import { getAllSessions } from "../storage";
import { resolveCloudEndpoint } from "../cloud-endpoint";

const DONE_KEY = "tracebug_milestone_ask_done";
const CARD_ID = "tracebug-milestone-ask";
const MILESTONE = 5;

export function maybeShowMilestoneAsk(root: HTMLElement): void {
  try {
    if (localStorage.getItem(DONE_KEY)) return;
    const savedCount = getAllSessions().filter((s) => s.saved).length;
    if (savedCount < MILESTONE) return;
  } catch {
    return;
  }
  if (document.getElementById(CARD_ID)) return;
  // Mark done the moment it appears — strictest possible "once ever".
  try { localStorage.setItem(DONE_KEY, "1"); } catch {}

  const card = document.createElement("div");
  card.id = CARD_ID;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "TraceBug update emails — optional");
  card.style.cssText = [
    "position:fixed", "right:16px", "bottom:16px", "width:320px",
    "background:var(--tb-bg-secondary,#1a1a2e)",
    "border:1px solid var(--tb-border-hover,#3a3a5e)",
    // Max z-index, same as the ticket modal — the card is appended AFTER the
    // modal, so among equals it paints (and clicks) on top. At 2147483646 it
    // rendered visibly but the modal's overlay swallowed every click.
    "border-radius:12px", "padding:16px", "z-index:2147483647",
    "font-family:var(--tb-font-family,system-ui,sans-serif)",
    "color:var(--tb-text-primary,#e0e0e0)",
    "box-shadow:0 12px 40px rgba(0,0,0,0.5)",
  ].join(";");

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div style="font-size:13px;font-weight:700">🎉 That's your ${MILESTONE}th saved ticket</div>
      <button data-act="close" aria-label="Dismiss" style="background:none;border:none;color:var(--tb-text-muted,#888);cursor:pointer;font-size:15px;line-height:1;padding:0">✕</button>
    </div>
    <p style="margin:6px 0 10px;font-size:12px;line-height:1.5;color:var(--tb-text-secondary,#aaa)">
      Want release updates from the solo dev who builds TraceBug? A few emails a year, nothing else.
    </p>
    <form data-act="form" style="display:flex;gap:6px">
      <input data-act="email" type="email" required placeholder="you@company.com" aria-label="Email address"
        style="flex:1;min-width:0;background:var(--tb-bg-primary,#12121f);border:1px solid var(--tb-border,#2a2a3e);border-radius:8px;padding:8px 10px;font-size:12px;color:inherit;font-family:inherit;outline:none" />
      <button type="submit" data-act="submit"
        style="background:var(--tb-accent,#6366F1);color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">Keep me posted</button>
    </form>
    <button data-act="no" style="margin-top:8px;background:none;border:none;color:var(--tb-text-muted,#888);font-size:11px;cursor:pointer;padding:0;font-family:inherit;text-decoration:underline">
      No thanks — never ask again
    </button>
    <p style="margin:8px 0 0;font-size:10.5px;color:var(--tb-text-muted,#888);line-height:1.4">
      Optional — TraceBug works fully without this, forever.
    </p>
  `;

  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    card.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
  };
  document.addEventListener("keydown", onKey, true);

  card.querySelector('[data-act="close"]')?.addEventListener("click", close);
  card.querySelector('[data-act="no"]')?.addEventListener("click", close);

  card.querySelector('[data-act="form"]')?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = card.querySelector<HTMLInputElement>('[data-act="email"]');
    const btn = card.querySelector<HTMLButtonElement>('[data-act="submit"]');
    const email = input?.value.trim();
    if (!email) return;
    if (btn) { btn.disabled = true; btn.textContent = "Adding…"; }
    fetch(`${resolveCloudEndpoint()}/api/notify-me`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "milestone-5" }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        card.innerHTML = `<div style="font-size:12.5px;line-height:1.5">✓ You're on the list — thanks for using TraceBug this much.</div>`;
        setTimeout(close, 2500);
      })
      .catch(() => {
        // Host-page CSP or offline can block the request — degrade honestly
        // to a link instead of a dead button.
        card.innerHTML = `<div style="font-size:12px;line-height:1.5">This page blocked the request — you can sign up at
          <a href="https://tracebug.dev/#updates" target="_blank" rel="noopener" style="color:var(--tb-accent,#6366F1)">tracebug.dev</a> instead. Sorry!</div>`;
        setTimeout(close, 6000);
      });
  });

  root.appendChild(card);
}
