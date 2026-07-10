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
}

// Brand palette — aligned 1:1 with the website design tokens
// (website/app/globals.css). Dark is the "cyber-graphite" theme: near-black
// #0B0D10 base, cool slate text, violet primary, cyan accent.
const DARK_THEME: ThemeTokens = {
  "--tb-bg-primary": "#0B0D10",
  "--tb-bg-secondary": "#11151A",
  "--tb-bg-elevated": "#161B22",
  "--tb-bg-overlay": "#0B0D10f2",
  "--tb-text-primary": "#E6EDF3",
  "--tb-text-secondary": "#94A3B8",
  "--tb-text-muted": "#64748B",
  "--tb-accent": "#7C5CFF",
  "--tb-accent-hover": "#9B7DFF",
  "--tb-accent-subtle": "#7C5CFF1f",
  "--tb-ring": "rgba(124, 92, 255, 0.55)",
  "--tb-error": "#FF5D73",
  "--tb-error-bg": "#FF5D731a",
  "--tb-warning": "#F59E0B",
  "--tb-warning-bg": "#F59E0B1a",
  "--tb-success": "#22C55E",
  "--tb-success-bg": "#22C55E1a",
  "--tb-info": "#3b82f6",
  "--tb-info-bg": "#3b82f61a",
  "--tb-border": "#1F2630",
  "--tb-border-subtle": "#161B22",
  "--tb-border-hover": "#2A3441",
  "--tb-radius-sm": "8px",
  "--tb-radius-md": "12px",
  "--tb-radius-lg": "16px",
  "--tb-shadow-sm": "0 1px 2px rgba(0,0,0,0.4), 0 1px 1px rgba(0,0,0,0.3)",
  "--tb-shadow-md": "0 4px 16px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.25)",
  "--tb-shadow-lg": "0 16px 48px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.3)",
  "--tb-font-family": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  "--tb-font-mono": "ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace",
  "--tb-toolbar-bg": "#11151Aee",
  "--tb-panel-bg": "#0B0D10",
  "--tb-btn-hover": "#ffffff0d",
  "--tb-btn-text": "#94A3B8",
  "--tb-btn-text-hover": "#E6EDF3",
  "--tb-severity-critical": "#FF5D73",
  "--tb-severity-major": "#F59E0B",
  "--tb-severity-minor": "#eab308",
  "--tb-severity-info": "#3b82f6",
  "--tb-intent-fix": "#FF5D73",
  "--tb-intent-redesign": "#7C5CFF",
  "--tb-intent-remove": "#f97316",
  "--tb-intent-question": "#3b82f6",
  "--tb-highlight": "#7C5CFF",
  "--tb-selection": "#00D9FF",
  "--tb-gradient-start": "#9B7DFF",
  "--tb-gradient-end": "#00D9FF",
  "--tb-code-tag": "#f472b6",
  "--tb-code-attr-name": "#fcd34d",
  "--tb-code-attr-val": "#86efac",
  "--tb-code-text": "#d4d4d8",
  "--tb-code-bg": "#0B0D10",
};

// Brand light palette — aligned 1:1 with the website design tokens
// (website/app/globals.css). White cards, cool #F8F9FB surfaces, #EAECF1
// hairline borders, near-black #0C0F17 text, violet-600 primary.
const LIGHT_THEME: ThemeTokens = {
  "--tb-bg-primary": "#ffffff",
  "--tb-bg-secondary": "#F8F9FB",
  "--tb-bg-elevated": "#ffffff",
  "--tb-bg-overlay": "#ffffffee",
  "--tb-text-primary": "#0C0F17",
  "--tb-text-secondary": "#505869",
  "--tb-text-muted": "#868E9F",
  "--tb-accent": "#6D4AFF",
  "--tb-accent-hover": "#5B3FE6",
  "--tb-accent-subtle": "#6D4AFF14",
  "--tb-ring": "rgba(109, 74, 255, 0.55)",
  "--tb-error": "#DC2626",
  "--tb-error-bg": "#fef2f2",
  "--tb-warning": "#D97706",
  "--tb-warning-bg": "#fffbeb",
  "--tb-success": "#16A34A",
  "--tb-success-bg": "#ecfdf5",
  "--tb-info": "#2563eb",
  "--tb-info-bg": "#eff6ff",
  "--tb-border": "#EAECF1",
  "--tb-border-subtle": "#F1F3F7",
  "--tb-border-hover": "#DBDFE6",
  "--tb-radius-sm": "8px",
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
  "--tb-btn-text": "#505869",
  "--tb-btn-text-hover": "#0C0F17",
  "--tb-severity-critical": "#DC2626",
  "--tb-severity-major": "#D97706",
  "--tb-severity-minor": "#ca8a04",
  "--tb-severity-info": "#2563eb",
  "--tb-intent-fix": "#DC2626",
  "--tb-intent-redesign": "#6D4AFF",
  "--tb-intent-remove": "#ea580c",
  "--tb-intent-question": "#2563eb",
  "--tb-highlight": "#6D4AFF",
  "--tb-selection": "#0891B2",
  "--tb-gradient-start": "#7C5CFF",
  "--tb-gradient-end": "#22D3EE",
  "--tb-code-tag": "#be185d",
  "--tb-code-attr-name": "#a16207",
  "--tb-code-attr-val": "#15803d",
  "--tb-code-text": "#27272a",
  "--tb-code-bg": "#F1F3F7",
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
