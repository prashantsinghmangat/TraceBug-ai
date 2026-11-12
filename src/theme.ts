// ── Theme System ──────────────────────────────────────────────────────────
// CSS custom property design tokens with light/dark theme support.
// All TraceBug UI components read from these variables.

import { createStyleTag } from "./ui/helpers";

export type ThemeMode = "light" | "dark" | "auto";

export interface ThemeTokens {
  "--tb-bg-primary": string;
  "--tb-bg-secondary": string;
  "--tb-bg-elevated": string;
  "--tb-bg-overlay": string;
  "--tb-text-primary": string;
  "--tb-text-secondary": string;
  "--tb-text-muted": string;
  "--tb-accent": string;
  "--tb-accent-hover": string;
  "--tb-accent-subtle": string;
  /** Focus-visible ring color — shadcn's `ring-primary/60`. Pair with a
   *  bg-colored offset ring: box-shadow: 0 0 0 2px bg, 0 0 0 4px var(--tb-ring). */
  "--tb-ring": string;
  "--tb-error": string;
  "--tb-error-bg": string;
  "--tb-warning": string;
  "--tb-warning-bg": string;
  "--tb-success": string;
  "--tb-success-bg": string;
  "--tb-info": string;
  "--tb-info-bg": string;
  "--tb-border": string;
  "--tb-border-subtle": string;
  "--tb-border-hover": string;
  "--tb-radius-sm": string;
  "--tb-radius-md": string;
  "--tb-radius-lg": string;
  "--tb-shadow-sm": string;
  "--tb-shadow-md": string;
  "--tb-shadow-lg": string;
  "--tb-font-family": string;
  "--tb-font-mono": string;
  "--tb-toolbar-bg": string;
  "--tb-panel-bg": string;
  "--tb-btn-hover": string;
  "--tb-btn-text": string;
  "--tb-btn-text-hover": string;
  "--tb-severity-critical": string;
  "--tb-severity-major": string;
  "--tb-severity-minor": string;
  "--tb-severity-info": string;
  "--tb-intent-fix": string;
  "--tb-intent-redesign": string;
  "--tb-intent-remove": string;
  "--tb-intent-question": string;
  "--tb-highlight": string;
  "--tb-selection": string;
  "--tb-gradient-start": string;
  "--tb-gradient-end": string;
  // Syntax-highlighting palette (used by the Action chip element previews).
  "--tb-code-tag": string;
  "--tb-code-attr-name": string;
  "--tb-code-attr-val": string;
  "--tb-code-text": string;
  // Generic surface for code-ish boxes (stack traces, response bodies).
  "--tb-code-bg": string;
  // Text/icon colour on an accent fill.
  "--tb-on-accent": string;
}

// Brand palette — "Midnight coral": midnight neutrals with a single coral
// accent, flat (both gradient stops are the same coral). Aligned 1:1 with
// website/app/globals.css (.dark). Text on a coral fill is ink
// (--tb-on-accent): white on #FF5C6C is ~3:1. --tb-intent-redesign stays
// indigo on purpose — it's a category colour, and coral would read as "fix".
const DARK_THEME: ThemeTokens = {
  "--tb-bg-primary": "#0B0D14",
  "--tb-bg-secondary": "#141823",
  "--tb-bg-elevated": "#1B202E",
  "--tb-bg-overlay": "#0B0D14f2",
  "--tb-text-primary": "#EEF0F5",
  "--tb-text-secondary": "#A8AEBE",
  "--tb-text-muted": "#8A91A5",
  "--tb-accent": "#FF5C6C",
  "--tb-accent-hover": "#FF8590",
  "--tb-on-accent": "#0B0D14",
  "--tb-accent-subtle": "#FF5C6C1f",
  "--tb-ring": "rgba(255, 92, 108, 0.5)",
  "--tb-error": "#F05257",
  "--tb-error-bg": "#F0525719",
  "--tb-warning": "#E0A040",
  "--tb-warning-bg": "#E0A04019",
  "--tb-success": "#4CC38A",
  "--tb-success-bg": "#4CC38A19",
  "--tb-info": "#3B82F6",
  "--tb-info-bg": "#3B82F619",
  "--tb-border": "#252A38",
  "--tb-border-subtle": "#1B202E",
  "--tb-border-hover": "#333A4D",
  "--tb-radius-sm": "10px",
  "--tb-radius-md": "12px",
  "--tb-radius-lg": "16px",
  "--tb-shadow-sm": "0 1px 2px rgba(0,0,0,0.4), 0 1px 1px rgba(0,0,0,0.3)",
  "--tb-shadow-md": "0 4px 16px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.25)",
  "--tb-shadow-lg": "0 16px 48px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.3)",
  "--tb-font-family": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  "--tb-font-mono": "ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace",
  "--tb-toolbar-bg": "#141823ee",
  "--tb-panel-bg": "#0B0D14",
  "--tb-btn-hover": "#ffffff0d",
  "--tb-btn-text": "#A8AEBE",
  "--tb-btn-text-hover": "#EEF0F5",
  "--tb-severity-critical": "#EF4444",
  "--tb-severity-major": "#F59E0B",
  "--tb-severity-minor": "#eab308",
  "--tb-severity-info": "#3B82F6",
  "--tb-intent-fix": "#EF4444",
  "--tb-intent-redesign": "#6366F1",
  "--tb-intent-remove": "#f97316",
  "--tb-intent-question": "#3B82F6",
  "--tb-highlight": "#FF5C6C",
  "--tb-selection": "#FF5C6C",
  "--tb-gradient-start": "#FF5C6C",
  "--tb-gradient-end": "#FF5C6C",
  "--tb-code-tag": "#f472b6",
  "--tb-code-attr-name": "#fcd34d",
  "--tb-code-attr-val": "#86efac",
  "--tb-code-text": "#d4d4d8",
  "--tb-code-bg": "#141823",
};

// Brand light palette — the light counterpart (website :root): white cards,
// cool grey surfaces and borders, ink text, and the deeper coral #C81E3C so
// it stays AA-legible on white (white text on it passes too).
const LIGHT_THEME: ThemeTokens = {
  "--tb-bg-primary": "#ffffff",
  "--tb-bg-secondary": "#F4F5F8",
  "--tb-bg-elevated": "#ffffff",
  "--tb-bg-overlay": "#ffffffee",
  "--tb-text-primary": "#0B0D14",
  "--tb-text-secondary": "#4B5565",
  // #82828C was 3.8:1 on white — fails WCAG AA for normal text. #75757E is
  // 4.56:1, the minimal darkening that clears the 4.5:1 bar.
  "--tb-text-muted": "#677082",
  "--tb-accent": "#C81E3C",
  "--tb-accent-hover": "#A3162F",
  "--tb-on-accent": "#ffffff",
  "--tb-accent-subtle": "#C81E3C14",
  "--tb-ring": "rgba(200, 30, 60, 0.5)",
  "--tb-error": "#DC2626",
  "--tb-error-bg": "#fef2f2",
  "--tb-warning": "#D97706",
  "--tb-warning-bg": "#fffbeb",
  "--tb-success": "#16A34A",
  "--tb-success-bg": "#ecfdf5",
  "--tb-info": "#2563EB",
  "--tb-info-bg": "#eff6ff",
  "--tb-border": "#E2E4EA",
  "--tb-border-subtle": "#ECEEF2",
  "--tb-border-hover": "#D0D4DC",
  "--tb-radius-sm": "10px",
  "--tb-radius-md": "12px",
  "--tb-radius-lg": "16px",
  "--tb-shadow-sm": "0 1px 2px rgba(16,24,40,0.04), 0 1px 1px rgba(16,24,40,0.03)",
  "--tb-shadow-md": "0 4px 16px rgba(16,24,40,0.08), 0 2px 4px rgba(16,24,40,0.04)",
  "--tb-shadow-lg": "0 16px 48px rgba(16,24,40,0.12), 0 4px 12px rgba(16,24,40,0.06)",
  "--tb-font-family": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  "--tb-font-mono": "ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace",
  "--tb-toolbar-bg": "#ffffffee",
  "--tb-panel-bg": "#ffffff",
  "--tb-btn-hover": "#00000008",
  "--tb-btn-text": "#4B5565",
  "--tb-btn-text-hover": "#0B0D14",
  "--tb-severity-critical": "#DC2626",
  "--tb-severity-major": "#D97706",
  "--tb-severity-minor": "#ca8a04",
  "--tb-severity-info": "#2563EB",
  "--tb-intent-fix": "#DC2626",
  "--tb-intent-redesign": "#4F46E5",
  "--tb-intent-remove": "#ea580c",
  "--tb-intent-question": "#2563EB",
  "--tb-highlight": "#C81E3C",
  "--tb-selection": "#C81E3C",
  "--tb-gradient-start": "#C81E3C",
  "--tb-gradient-end": "#C81E3C",
  "--tb-code-tag": "#be185d",
  "--tb-code-attr-name": "#a16207",
  "--tb-code-attr-val": "#15803d",
  "--tb-code-text": "#252A38",
  "--tb-code-bg": "#F4F5F8",
};

const THEME_STYLE_ID = "tracebug-theme-vars";

let _currentMode: ThemeMode = "light";
let _mediaQuery: MediaQueryList | null = null;
let _mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

/** Get the resolved theme (dark or light) for the current mode */
export function getResolvedTheme(): "dark" | "light" {
  if (_currentMode === "auto") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return _currentMode === "dark" ? "dark" : "light";
}

/** Get the current theme tokens */
export function getThemeTokens(): ThemeTokens {
  return getResolvedTheme() === "dark" ? DARK_THEME : LIGHT_THEME;
}

/** Get a specific token value */
export function token(name: keyof ThemeTokens): string {
  return getThemeTokens()[name];
}

/** Inject CSS custom properties into #tracebug-root */
export function injectTheme(mode: ThemeMode): void {
  _currentMode = mode;

  _applyThemeVars();

  // Watch for system theme changes in auto mode
  if (mode === "auto") {
    _mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    _mediaListener = () => _applyThemeVars();
    _mediaQuery.addEventListener("change", _mediaListener);
  }
}

/** Re-apply the current theme to #tracebug-root. init() calls injectTheme()
 *  before mountDashboard() creates the root, and _applyThemeVars() is a no-op
 *  without one — so the mount must call this once the root is in the DOM,
 *  or no token reaches the in-page UI (every var(--tb-…) without a fallback
 *  resolves to nothing: the ticket's More menu rendered transparent). */
export function applyThemeToRoot(): void {
  _applyThemeVars();
}

/** Remove theme styles and listeners */
export function removeTheme(): void {
  const root = document.getElementById("tracebug-root");
  if (root) root.removeAttribute("data-tb-theme");
  // Legacy cleanup: an older build of this function injected a <style> tag
  // with this id. Harmless to also remove if a stale one is ever found.
  const el = document.getElementById(THEME_STYLE_ID);
  if (el) el.remove();

  if (_mediaQuery && _mediaListener) {
    _mediaQuery.removeEventListener("change", _mediaListener);
    _mediaQuery = null;
    _mediaListener = null;
  }
}

/**
 * Both themes' full token sets are static CSS in
 * tracebug-extension/tracebug-injected-styles.css, keyed on
 * #tracebug-root[data-tb-theme="dark"|"light"]. This used to instead REWRITE
 * a <style> tag's textContent with whichever theme's tokens were active —
 * which needs a nonce (or chrome.scripting.insertCSS) just like any other
 * injected stylesheet, and was one more thing silently inert on a page
 * whose CSP had no discoverable nonce. A plain `data-*` attribute has no
 * such dependency: HTML attributes other than `style` are outside
 * style-src's reach entirely, so this now just flips which pre-shipped
 * block of CSS rules matches — nothing to authorize, ever.
 */
function _applyThemeVars(): void {
  const root = document.getElementById("tracebug-root");
  if (!root) return;
  root.setAttribute("data-tb-theme", getResolvedTheme());
  // createStyleTag import kept: non-extension (npm SDK) pages have no
  // chrome.scripting.insertCSS, so this is still the fallback there — see
  // the comment on tracebug-injected-styles.css for why it's additive, not
  // a replacement, in the extension context.
  let existing = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!existing) {
    existing = createStyleTag(THEME_STYLE_ID);
    document.head.appendChild(existing);
  }
  const tokens = getThemeTokens();
  const vars = Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  existing.textContent = `
    #tracebug-root[data-tb-theme="${getResolvedTheme()}"] {
${vars}
    }
  `;
}
