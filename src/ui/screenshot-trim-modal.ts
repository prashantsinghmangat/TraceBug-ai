// ── Screenshot trim picker ────────────────────────────────────────────────
// Shown when the user clicks Share link on a report with more than 5
// screenshots. Cloud free-plan limit is 5/share; this modal lets the user
// choose which to keep instead of failing the upload outright.
//
// Returns the selected screenshot IDs (length === max), or null if cancelled.

import type { ScreenshotData } from "../types";

const MODAL_ID = "tracebug-screenshot-trim-modal";

export function showScreenshotTrimModal(
  screenshots: ScreenshotData[],
  max: number,
  root?: HTMLElement | null,
): Promise<string[] | null> {
  return new Promise((resolve) => {
    document.getElementById(MODAL_ID)?.remove();
    const host = root || document.getElementById("tracebug-root") || document.body;

    // Default selection: first `max` screenshots (chronological order).
    // User can toggle to swap which ones go up.
    const selected = new Set<string>(screenshots.slice(0, max).map((s) => s.id));

    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.dataset.tracebug = "screenshot-trim-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(0,0,0,0.72); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center; padding: 20px;
      font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      background: var(--tb-bg-secondary, #1a1a2e);
      border: 1px solid var(--tb-border-hover, #3a3a5e);
      border-radius: 12px;
      width: 100%; max-width: 720px; max-height: 86vh;
      display: flex; flex-direction: column;
      color: var(--tb-text-primary, #e0e0e0);
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      overflow: hidden;
    `;

    const renderCounter = () => `${selected.size} / ${max} selected`;
    const renderHeader = () => `
      <div style="padding:18px 22px;border-bottom:1px solid var(--tb-border, #2a2a4e);">
        <div style="font-size:16px;font-weight:700;margin-bottom:4px">Choose screenshots to share</div>
        <div style="font-size:12px;color:var(--tb-text-secondary, #aaa);line-height:1.5">
          Free plan allows ${max} screenshots per shared report. Pick which ${max} to upload — the rest stay in your local report.
        </div>
      </div>
    `;

    const tileFor = (s: ScreenshotData) => {
      const isSel = selected.has(s.id);
      const order = isSel ? [...selected].indexOf(s.id) + 1 : null;
      return `
        <button type="button" data-id="${escapeAttr(s.id)}" class="tb-trim-tile"
          aria-pressed="${isSel}"
          style="
            position: relative; padding: 0; cursor: pointer; background: var(--tb-bg-primary, #0d0d1a);
            border: 2px solid ${isSel ? "var(--tb-accent, #6366F1)" : "var(--tb-border, #2a2a4e)"};
            border-radius: 8px; overflow: hidden; aspect-ratio: 16 / 10;
            transition: border-color .15s, transform .12s;
          ">
          <img src="${escapeAttr(s.originalDataUrl || s.dataUrl)}" alt=""
            style="width:100%;height:100%;object-fit:cover;display:block;${isSel ? "" : "opacity:0.55;filter:grayscale(0.4)"}" />
          ${isSel ? `
            <div style="position:absolute;top:6px;left:6px;background:var(--tb-accent,#6366F1);color:#fff;
              width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;
              font-size:11px;font-weight:700">${order}</div>
          ` : ""}
          <div style="position:absolute;bottom:0;left:0;right:0;padding:6px 8px;
            background:linear-gradient(to top, rgba(0,0,0,0.7), transparent);
            font-size:10px;color:#fff;text-align:left;font-family:var(--tb-font-mono, monospace)">
            ${escapeText(s.filename || "")}
          </div>
        </button>
      `;
    };

    const renderGrid = () => `
      <div style="padding:16px 22px;overflow-y:auto;flex:1">
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));gap:10px">
          ${screenshots.map(tileFor).join("")}
        </div>
      </div>
    `;

    const renderFooter = () => `
      <div style="padding:14px 22px;border-top:1px solid var(--tb-border, #2a2a4e);
        display:flex;align-items:center;gap:12px">
        <div id="tb-trim-counter" style="font-size:13px;color:var(--tb-text-secondary, #aaa)">${renderCounter()}</div>
        <div style="flex:1"></div>
        <button data-action="cancel" type="button" style="
          padding:8px 16px;border-radius:8px;border:1px solid var(--tb-border, #2a2a4e);
          background:transparent;color:var(--tb-text-primary, #e0e0e0);font-size:13px;font-weight:500;cursor:pointer;
          font-family:inherit
        ">Cancel</button>
        <button data-action="continue" type="button" id="tb-trim-continue" style="
          padding:8px 18px;border-radius:8px;border:none;
          background:var(--tb-accent, #6366F1);color:#fff;font-size:13px;font-weight:600;cursor:pointer;
          font-family:inherit;transition:opacity .15s
        ">Continue · upload ${max}</button>
      </div>
    `;

    card.innerHTML = renderHeader() + renderGrid() + renderFooter();
    overlay.appendChild(card);
    host.appendChild(overlay);

    const counterEl = card.querySelector<HTMLElement>("#tb-trim-counter");
    const continueBtn = card.querySelector<HTMLButtonElement>("#tb-trim-continue");

    function updateContinueState() {
      if (!continueBtn) return;
      const ok = selected.size === max;
      continueBtn.disabled = !ok;
      continueBtn.style.opacity = ok ? "1" : "0.5";
      continueBtn.style.cursor = ok ? "pointer" : "not-allowed";
      if (counterEl) counterEl.textContent = renderCounter();
    }

    function rerenderGrid() {
      card.querySelectorAll("button.tb-trim-tile").forEach((b) => {
        const id = (b as HTMLElement).dataset.id || "";
        const isSel = selected.has(id);
        const order = isSel ? [...selected].indexOf(id) + 1 : null;
        b.setAttribute("aria-pressed", String(isSel));
        (b as HTMLElement).style.borderColor = isSel ? "var(--tb-accent, #6366F1)" : "var(--tb-border, #2a2a4e)";
        const img = b.querySelector<HTMLImageElement>("img");
        if (img) img.style.cssText = `width:100%;height:100%;object-fit:cover;display:block;${isSel ? "" : "opacity:0.55;filter:grayscale(0.4)"}`;
        const badge = b.querySelector("[data-order-badge]");
        if (isSel && !badge) {
          const d = document.createElement("div");
          d.setAttribute("data-order-badge", "1");
          d.style.cssText = `position:absolute;top:6px;left:6px;background:var(--tb-accent,#6366F1);color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700`;
          d.textContent = String(order);
          b.appendChild(d);
        } else if (!isSel && badge) {
          badge.remove();
        } else if (isSel && badge) {
          badge.textContent = String(order);
        }
      });
    }

    function close(result: string[] | null) {
      overlay.remove();
      resolve(result);
    }

    card.addEventListener("click", (e) => {
      const tgt = e.target as HTMLElement;
      const tile = tgt.closest<HTMLButtonElement>(".tb-trim-tile");
      if (tile) {
        const id = tile.dataset.id || "";
        if (selected.has(id)) selected.delete(id);
        else if (selected.size < max) selected.add(id);
        // Else (already at cap): ignore click. Visual hint could be added.
        rerenderGrid();
        updateContinueState();
        return;
      }
      const action = (tgt.closest("[data-action]") as HTMLElement | null)?.dataset.action;
      if (action === "cancel") close(null);
      if (action === "continue") {
        if (selected.size !== max) return;
        // Preserve original chronological order of selected items.
        const chosen = screenshots.filter((s) => selected.has(s.id)).map((s) => s.id);
        close(chosen);
      }
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { document.removeEventListener("keydown", onKey); close(null); }
    };
    document.addEventListener("keydown", onKey);

    updateContinueState();
  });
}

function escapeAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function escapeText(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
