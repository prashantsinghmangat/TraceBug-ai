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
}

const DARK_THEME: ThemeTokens = {
  "--tb-bg-primary": "#0f0f1a",
  "--tb-bg-secondary": "#1a1a2e",
  "--tb-bg-elevated": "#22223a",
  "--tb-bg-overlay": "#0f0f1aee",
  "--tb-text-primary": "#e0e0e0",
  "--tb-text-secondary": "#aaaaaa",
  "--tb-text-muted": "#666666",
  "--tb-accent": "#7B61FF",
  "--tb-accent-hover": "#9B81FF",
  "--tb-accent-subtle": "#7B61FF33",
  "--tb-error": "#ef4444",
  "--tb-error-bg": "#ef444422",
  "--tb-warning": "#f97316",
  "--tb-warning-bg": "#f9731622",
  "--tb-success": "#22c55e",
  "--tb-success-bg": "#22c55e22",
  "--tb-info": "#3b82f6",
  "--tb-info-bg": "#3b82f622",
  "--tb-border": "#2a2a3e",
  "--tb-border-subtle": "#1f1f33",
  "--tb-border-hover": "#4a4a6e",
  "--tb-radius-sm": "4px",
  "--tb-radius-md": "8px",
  "--tb-radius-lg": "12px",
  "--tb-shadow-sm": "0 2px 8px rgba(0,0,0,0.3)",
  "--tb-shadow-md": "0 4px 24px rgba(0,0,0,0.5)",
  "--tb-shadow-lg": "0 8px 32px rgba(0,0,0,0.6)",
  "--tb-font-family": "system-ui, -apple-system, sans-serif",
  "--tb-font-mono": "'SF Mono', Consolas, ui-monospace, monospace",
  "--tb-toolbar-bg": "#0f0f1aee",
  "--tb-panel-bg": "#0f0f1a",
  "--tb-btn-hover": "#ffffff15",
  "--tb-btn-text": "#aaaaaa",
  "--tb-btn-text-hover": "#ffffff",
  "--tb-severity-critical": "#ef4444",
  "--tb-severity-major": "#f97316",
  "--tb-severity-minor": "#eab308",
  "--tb-severity-info": "#3b82f6",
  "--tb-intent-fix": "#ef4444",
  "--tb-intent-redesign": "#7B61FF",
  "--tb-intent-remove": "#f97316",
  "--tb-intent-question": "#3b82f6",
  "--tb-highlight": "#7B61FF",
  "--tb-selection": "#00E5FF",
  "--tb-gradient-start": "#7B61FF",
  "--tb-gradient-end": "#5B3FDF",
};

const LIGHT_THEME: ThemeTokens = {
  "--tb-bg-primary": "#ffffff",
  "--tb-bg-secondary": "#f5f5f7",
  "--tb-bg-elevated": "#ffffff",
  "--tb-bg-overlay": "#ffffffee",
  "--tb-text-primary": "#1a1a2e",
  "--tb-text-secondary": "#555555",
  "--tb-text-muted": "#999999",
  "--tb-accent": "#6B4FE0",
  "--tb-accent-hover": "#5A3ED0",
  "--tb-accent-subtle": "#6B4FE022",
  "--tb-error": "#dc2626",
  "--tb-error-bg": "#fef2f2",
  "--tb-warning": "#ea580c",
  "--tb-warning-bg": "#fff7ed",
  "--tb-success": "#16a34a",
  "--tb-success-bg": "#f0fdf4",
  "--tb-info": "#2563eb",
  "--tb-info-bg": "#eff6ff",
  "--tb-border": "#e0e0e6",
  "--tb-border-subtle": "#f0f0f4",
  "--tb-border-hover": "#c0c0cc",
  "--tb-radius-sm": "4px",
  "--tb-radius-md": "8px",
  "--tb-radius-lg": "12px",
  "--tb-shadow-sm": "0 1px 4px rgba(0,0,0,0.08)",
  "--tb-shadow-md": "0 4px 16px rgba(0,0,0,0.12)",
  "--tb-shadow-lg": "0 8px 32px rgba(0,0,0,0.16)",
  "--tb-font-family": "system-ui, -apple-system, sans-serif",
  "--tb-font-mono": "'SF Mono', Consolas, ui-monospace, monospace",
  "--tb-toolbar-bg": "#ffffffee",
  "--tb-panel-bg": "#ffffff",
  "--tb-btn-hover": "#00000010",
  "--tb-btn-text": "#666666",
  "--tb-btn-text-hover": "#1a1a2e",
  "--tb-severity-critical": "#dc2626",
  "--tb-severity-major": "#ea580c",
  "--tb-severity-minor": "#ca8a04",
  "--tb-severity-info": "#2563eb",
  "--tb-intent-fix": "#dc2626",
  "--tb-intent-redesign": "#6B4FE0",
  "--tb-intent-remove": "#ea580c",
  "--tb-intent-question": "#2563eb",
  "--tb-highlight": "#6B4FE0",
  "--tb-selection": "#0ea5e9",
  "--tb-gradient-start": "#6B4FE0",
  "--tb-gradient-end": "#4A2FC0",
};

const THEME_STYLE_ID = "tracebug-theme-vars";

let _currentMode: ThemeMode = "dark";
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
