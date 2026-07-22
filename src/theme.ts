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

// Brand palette — "Slate Indigo": slate-tinted near-black neutrals with a
// single refined indigo accent (the brand color). Green stays reserved for
// success states so semantics remain unambiguous. Premium developer-tool feel
// (Linear / Vercel); no neon, soft shadows. Aligned 1:1 with website/app/globals.css.
const DARK_THEME: ThemeTokens = {
  "--tb-bg-primary": "#0B0B10",
  "--tb-bg-secondary": "#16161D",
  "--tb-bg-elevated": "#1E1E26",
  "--tb-bg-overlay": "#0B0B10f2",
  "--tb-text-primary": "#FAFAFA",
  "--tb-text-secondary": "#A1A1AA",
  "--tb-text-muted": "#71717A",
  "--tb-accent": "#6366F1",
  "--tb-accent-hover": "#818CF8",
  "--tb-accent-subtle": "#6366F11f",
  "--tb-ring": "rgba(99, 102, 241, 0.5)",
  "--tb-error": "#EF4444",
  "--tb-error-bg": "#EF444419",
  "--tb-warning": "#F59E0B",
  "--tb-warning-bg": "#F59E0B19",
  "--tb-success": "#22C55E",
  "--tb-success-bg": "#22C55E19",
  "--tb-info": "#3B82F6",
  "--tb-info-bg": "#3B82F619",
  "--tb-border": "#26262E",
  "--tb-border-subtle": "#1E1E24",
  "--tb-border-hover": "#2A2A35",
  "--tb-radius-sm": "10px",
  "--tb-radius-md": "12px",
  "--tb-radius-lg": "16px",
  "--tb-shadow-sm": "0 1px 2px rgba(0,0,0,0.4), 0 1px 1px rgba(0,0,0,0.3)",
  "--tb-shadow-md": "0 4px 16px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.25)",
  "--tb-shadow-lg": "0 16px 48px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.3)",
  "--tb-font-family": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  "--tb-font-mono": "ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace",
  "--tb-toolbar-bg": "#16161Dee",
  "--tb-panel-bg": "#0B0B10",
  "--tb-btn-hover": "#ffffff0d",
  "--tb-btn-text": "#A1A1AA",
  "--tb-btn-text-hover": "#FAFAFA",
  "--tb-severity-critical": "#EF4444",
  "--tb-severity-major": "#F59E0B",
  "--tb-severity-minor": "#eab308",
  "--tb-severity-info": "#3B82F6",
  "--tb-intent-fix": "#EF4444",
  "--tb-intent-redesign": "#6366F1",
  "--tb-intent-remove": "#f97316",
  "--tb-intent-question": "#3B82F6",
  "--tb-highlight": "#6366F1",
  "--tb-selection": "#6366F1",
  "--tb-gradient-start": "#818CF8",
  "--tb-gradient-end": "#4F46E5",
  "--tb-code-tag": "#f472b6",
  "--tb-code-attr-name": "#fcd34d",
  "--tb-code-attr-val": "#86efac",
  "--tb-code-text": "#d4d4d8",
  "--tb-code-bg": "#14141F",
};

// Brand light palette — the light counterpart of Slate Indigo:
// white cards over zinc-50 surfaces, zinc borders, near-black text, and a
// slightly deeper indigo (#4F46E5) so it stays AA-legible on white.
const LIGHT_THEME: ThemeTokens = {
  "--tb-bg-primary": "#ffffff",
  "--tb-bg-secondary": "#FAFAFA",
  "--tb-bg-elevated": "#ffffff",
  "--tb-bg-overlay": "#ffffffee",
  "--tb-text-primary": "#111113",
  "--tb-text-secondary": "#52525B",
  // #82828C was 3.8:1 on white — fails WCAG AA for normal text. #75757E is
  // 4.56:1, the minimal darkening that clears the 4.5:1 bar.
  "--tb-text-muted": "#75757E",
  "--tb-accent": "#4F46E5",
  "--tb-accent-hover": "#4338CA",
  "--tb-accent-subtle": "#4F46E514",
  "--tb-ring": "rgba(79, 70, 229, 0.5)",
  "--tb-error": "#DC2626",
  "--tb-error-bg": "#fef2f2",
  "--tb-warning": "#D97706",
  "--tb-warning-bg": "#fffbeb",
  "--tb-success": "#16A34A",
  "--tb-success-bg": "#ecfdf5",
  "--tb-info": "#2563EB",
  "--tb-info-bg": "#eff6ff",
  "--tb-border": "#E4E4E7",
  "--tb-border-subtle": "#F4F4F5",
  "--tb-border-hover": "#D4D4D8",
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
  "--tb-btn-text": "#52525B",
  "--tb-btn-text-hover": "#111113",
  "--tb-severity-critical": "#DC2626",
  "--tb-severity-major": "#D97706",
  "--tb-severity-minor": "#ca8a04",
  "--tb-severity-info": "#2563EB",
  "--tb-intent-fix": "#DC2626",
  "--tb-intent-redesign": "#4F46E5",
  "--tb-intent-remove": "#ea580c",
  "--tb-intent-question": "#2563EB",
  "--tb-highlight": "#4F46E5",
  "--tb-selection": "#4F46E5",
  "--tb-gradient-start": "#818CF8",
  "--tb-gradient-end": "#4F46E5",
  "--tb-code-tag": "#be185d",
  "--tb-code-attr-name": "#a16207",
  "--tb-code-attr-val": "#15803d",
  "--tb-code-text": "#26262E",
  "--tb-code-bg": "#F4F4F5",
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
