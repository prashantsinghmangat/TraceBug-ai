// ── Freemium plan manager ─────────────────────────────────────────────────
// Single source of truth for the user's plan. No backend, no auth — the plan
// is a local flag in chrome.storage.local (extension context) or localStorage
// (web SDK). Defaults to "free". A dev/test toggle is exposed via setPlan().

export type Plan = "free" | "premium";

const STORAGE_KEY = "tracebug_plan";

// Paid plans aren't live yet — every feature is free for everyone ("plans
// coming soon"). While this is false, all gates below unlock and no upgrade
// wall ever interrupts the flow. Flip to true when a real checkout ships; the
// stored-plan logic underneath is preserved and takes over automatically.
export const PLANS_LIVE = false;

export const FREE_LIMITS = {
  /** Maximum screenshots a free user can attach to a single ticket. */
  screenshots: 2,
};

let _cached: Plan = "free";
let _hydrated = false;

// Minimal chrome.storage.local surface — we can't depend on @types/chrome in
// the web SDK build, and only these two callback-style methods are used.
interface ChromeStorageLocalLike {
  get(key: string, cb: (result: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>, cb: () => void): void;
}

interface ChromeLike {
  storage?: { local?: ChromeStorageLocalLike };
}

function getChrome(): ChromeLike | undefined {
  return (globalThis as { chrome?: ChromeLike }).chrome;
}

/**
 * Read the plan from storage and cache it. Idempotent — safe to call multiple
 * times. Called once at SDK init; getters are synchronous after that.
 */
export async function hydratePlan(): Promise<Plan> {
  if (_hydrated) return _cached;
  _hydrated = true;

  // Prefer chrome.storage.local in extension context (cross-popup persistence)
  try {
    const c = getChrome();
    if (c?.storage?.local?.get) {
      const local = c.storage.local;
      const result = await new Promise<Record<string, unknown>>((resolve) => {
        try {
          local.get(STORAGE_KEY, (r) => resolve(r || {}));
        } catch { resolve({}); }
      });
      const v = result[STORAGE_KEY];
      if (v === "premium" || v === "free") {
        _cached = v;
        return _cached;
      }
    }
  } catch {}

  // Fallback for plain web SDK or environments without chrome.storage
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "premium" || v === "free") _cached = v;
  } catch {}

  return _cached;
}

/** Synchronous read. Uses cached value — call hydratePlan() once at init. */
export function getPlan(): Plan {
  return _cached;
}

/** Convenience: true when the user is on the premium plan.
 *  While plans aren't live, this returns true for everyone so every feature is
 *  unlocked and free. */
export function isPremium(): boolean {
  if (!PLANS_LIVE) return true;
  return _cached === "premium";
}

/**
 * Set the plan and persist it. Used by the dev toggle and (in a future
 * release) the upgrade flow. Updates both chrome.storage.local and
 * localStorage so the change is visible across the extension and SDK.
 */
export async function setPlan(plan: Plan): Promise<void> {
  _cached = plan;
  _hydrated = true;
  try {
    const c = getChrome();
    if (c?.storage?.local?.set) {
      const local = c.storage.local;
      await new Promise<void>((resolve) => {
        try { local.set({ [STORAGE_KEY]: plan }, () => resolve()); }
        catch { resolve(); }
      });
    }
  } catch {}
  try { localStorage.setItem(STORAGE_KEY, plan); } catch {}
}

/**
 * Returns true if the user has room for another screenshot. Free users are
 * capped at FREE_LIMITS.screenshots; premium users are unbounded (the
 * underlying ring buffer in screenshot.ts still applies a global ceiling).
 */
export function canAddScreenshot(currentCount: number): boolean {
  if (isPremium()) return true;
  return currentCount < FREE_LIMITS.screenshots;
}
