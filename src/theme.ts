// ── Theme System ──────────────────────────────────────────────────────────
// CSS custom property design tokens with light/dark theme support.
// All TraceBug UI components read from these variables.

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
}

// Refined zinc-based dark palette — softer than the original navy/purple,
// more neutral, less visual noise. Anchored on Tailwind's zinc + violet ramps.
const DARK_THEME: ThemeTokens = {
  "--tb-bg-primary": "#0a0a0c",
  "--tb-bg-secondary": "#18181b",
  "--tb-bg-elevated": "#27272a",
  "--tb-bg-overlay": "#0a0a0cf2",
  "--tb-text-primary": "#fafafa",
  "--tb-text-secondary": "#a1a1aa",
  "--tb-text-muted": "#71717a",
  "--tb-accent": "#7C5CFF",
  "--tb-accent-hover": "#9B7DFF",
  "--tb-accent-subtle": "#7C5CFF1f",
  "--tb-error": "#ef4444",
  "--tb-error-bg": "#ef44441a",
  "--tb-warning": "#f59e0b",
  "--tb-warning-bg": "#f59e0b1a",
  "--tb-success": "#10b981",
  "--tb-success-bg": "#10b9811a",
  "--tb-info": "#3b82f6",
  "--tb-info-bg": "#3b82f61a",
  "--tb-border": "#27272a",
  "--tb-border-subtle": "#1f1f23",
  "--tb-border-hover": "#3f3f46",
  "--tb-radius-sm": "6px",
  "--tb-radius-md": "10px",
  "--tb-radius-lg": "14px",
  "--tb-shadow-sm": "0 1px 2px rgba(0,0,0,0.4), 0 1px 1px rgba(0,0,0,0.3)",
  "--tb-shadow-md": "0 4px 16px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.25)",
  "--tb-shadow-lg": "0 16px 48px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.3)",
  "--tb-font-family": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  "--tb-font-mono": "ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace",
  "--tb-toolbar-bg": "#18181bee",
  "--tb-panel-bg": "#0a0a0c",
  "--tb-btn-hover": "#ffffff0d",
  "--tb-btn-text": "#a1a1aa",
  "--tb-btn-text-hover": "#fafafa",
  "--tb-severity-critical": "#ef4444",
  "--tb-severity-major": "#f59e0b",
  "--tb-severity-minor": "#eab308",
  "--tb-severity-info": "#3b82f6",
  "--tb-intent-fix": "#ef4444",
  "--tb-intent-redesign": "#7C5CFF",
  "--tb-intent-remove": "#f97316",
  "--tb-intent-question": "#3b82f6",
  "--tb-highlight": "#7C5CFF",
  "--tb-selection": "#22D3EE",
  "--tb-gradient-start": "#7C5CFF",
  "--tb-gradient-end": "#22D3EE",
  "--tb-code-tag": "#f472b6",
  "--tb-code-attr-name": "#fcd34d",
  "--tb-code-attr-val": "#86efac",
  "--tb-code-text": "#d4d4d8",
  "--tb-code-bg": "#09090b",
};

// Clean light palette — pure whites for cards, zinc-100 for hover states,
// zinc-950 for primary text. Violet-600 accent reads strongly on white.
const LIGHT_THEME: ThemeTokens = {
  "--tb-bg-primary": "#ffffff",
  "--tb-bg-secondary": "#fafafa",
  "--tb-bg-elevated": "#ffffff",
  "--tb-bg-overlay": "#ffffffee",
  "--tb-text-primary": "#09090b",
  "--tb-text-secondary": "#52525b",
  "--tb-text-muted": "#a1a1aa",
  "--tb-accent": "#6D4AFF",
  "--tb-accent-hover": "#5B3FE6",
  "--tb-accent-subtle": "#6D4AFF14",
  "--tb-error": "#dc2626",
  "--tb-error-bg": "#fef2f2",
  "--tb-warning": "#d97706",
  "--tb-warning-bg": "#fffbeb",
  "--tb-success": "#059669",
  "--tb-success-bg": "#ecfdf5",
  "--tb-info": "#2563eb",
  "--tb-info-bg": "#eff6ff",
  "--tb-border": "#e4e4e7",
  "--tb-border-subtle": "#f4f4f5",
  "--tb-border-hover": "#d4d4d8",
  "--tb-radius-sm": "6px",
  "--tb-radius-md": "10px",
  "--tb-radius-lg": "14px",
  "--tb-shadow-sm": "0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03)",
  "--tb-shadow-md": "0 4px 16px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04)",
  "--tb-shadow-lg": "0 16px 48px rgba(15,23,42,0.12), 0 4px 12px rgba(15,23,42,0.06)",
  "--tb-font-family": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  "--tb-font-mono": "ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace",
  "--tb-toolbar-bg": "#ffffffee",
  "--tb-panel-bg": "#ffffff",
  "--tb-btn-hover": "#00000008",
  "--tb-btn-text": "#52525b",
  "--tb-btn-text-hover": "#09090b",
  "--tb-severity-critical": "#dc2626",
  "--tb-severity-major": "#d97706",
  "--tb-severity-minor": "#ca8a04",
  "--tb-severity-info": "#2563eb",
  "--tb-intent-fix": "#dc2626",
  "--tb-intent-redesign": "#6D4AFF",
  "--tb-intent-remove": "#ea580c",
  "--tb-intent-question": "#2563eb",
  "--tb-highlight": "#6D4AFF",
  "--tb-selection": "#0891b2",
  "--tb-gradient-start": "#7C5CFF",
  "--tb-gradient-end": "#22D3EE",
  "--tb-code-tag": "#be185d",
  "--tb-code-attr-name": "#a16207",
  "--tb-code-attr-val": "#15803d",
  "--tb-code-text": "#27272a",
  "--tb-code-bg": "#f4f4f5",
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

/** Remove theme styles and listeners */
export function removeTheme(): void {
  const el = document.getElementById(THEME_STYLE_ID);
  if (el) el.remove();

  if (_mediaQuery && _mediaListener) {
    _mediaQuery.removeEventListener("change", _mediaListener);
    _mediaQuery = null;
    _mediaListener = null;
  }
}

function _applyThemeVars(): void {
  const tokens = getThemeTokens();
  let existing = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;

  if (!existing) {
    existing = document.createElement("style");
    existing.id = THEME_STYLE_ID;
    document.head.appendChild(existing);
  }

  const vars = Object.entries(tokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");

  existing.textContent = `
    #tracebug-root {
${vars}
    }
  `;
}
