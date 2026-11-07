import type { Config } from "tailwindcss";

// Theming strategy:
// All brand colors are CSS variables in `R G B` channel form (see globals.css),
// referenced here as rgb(var(--x) / <alpha-value>). That keeps every
// `bg-primary/10`-style opacity utility working in BOTH light and dark themes —
// light is the default (:root), dark is opt-in via the `.dark` class on <html>.
const channel = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: channel("--background"),
        surface: channel("--surface"),
        "surface-2": channel("--surface-2"),
        border: channel("--border"),
        "border-strong": channel("--border-strong"),
        primary: channel("--primary"),
        "primary-soft": channel("--primary-soft"),
        accent: channel("--accent"),
        success: channel("--success"),
        error: channel("--error"),
        warning: channel("--warning"),
        "text-primary": channel("--text-primary"),
        "text-muted": channel("--text-muted"),
        "text-subtle": channel("--text-subtle"),
        "on-primary": channel("--on-primary"),
        cta: channel("--cta"),
        "on-cta": channel("--on-cta"),
        band: channel("--band"),
        "band-text": channel("--band-text"),
      },
      // Type scale and section rhythm: values live in globals.css (:root).
      fontSize: {
        display: ["var(--text-display)", { lineHeight: "1.04", letterSpacing: "-0.035em" }],
        h2: ["var(--text-h2)", { lineHeight: "1.06", letterSpacing: "-0.025em" }],
        h3: ["var(--text-h3)", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        lead: ["var(--text-lead)", { lineHeight: "1.6" }],
      },
      spacing: {
        section: "var(--section-y)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "grid-dot": "none",
        // Retired: hue gradients. Kept as a flat colour so old references still render.
        "brand-gradient": "linear-gradient(rgb(var(--primary)), rgb(var(--primary)))",
      },
      backgroundSize: {
        "grid-dot": "26px 26px",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      animation: {
        "fade-in": "fadeIn 0.3s cubic-bezier(0.22,1,0.36,1) both",
        "slide-up": "slideUp 0.48s cubic-bezier(0.22,1,0.36,1) both",
        marquee: "marquee 34s linear infinite",
        "marquee-slow": "marquee 60s linear infinite",
        // Retired looping decoration (unslop pass): names kept so old
        // class references compile, but nothing loops for no reason.
        aurora: "none",
        float: "none",
        "gradient-x": "none",
        shimmer: "none",
        "spin-slow": "none",
        "pulse-ring": "none",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        aurora: {
          "0%, 100%": { transform: "translate(0,0) scale(1)", opacity: "0.55" },
          "33%": { transform: "translate(6%,-4%) scale(1.12)", opacity: "0.75" },
          "66%": { transform: "translate(-5%,5%) scale(0.95)", opacity: "0.5" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        gradientX: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        shimmer: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(120%)" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.8)", opacity: "0.7" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
      },
      boxShadow: {
        // Neutral, soft, small. Depth on dark comes from surface steps + hairlines.
        xs: "0 1px 2px rgb(var(--shadow-ink) / 0.05)",
        soft: "0 1px 2px rgb(var(--shadow-ink) / 0.05)",
        card: "0 1px 2px rgb(var(--shadow-ink) / 0.04), 0 8px 24px rgb(var(--shadow-ink) / 0.06)",
        "card-hover": "0 1px 2px rgb(var(--shadow-ink) / 0.04), 0 8px 24px rgb(var(--shadow-ink) / 0.06)",
        float: "0 1px 2px rgb(var(--shadow-ink) / 0.06), 0 24px 48px -12px rgb(var(--shadow-ink) / 0.18)",
        // Retired coloured glows — now neutral so old references stay calm.
        "glow-primary": "0 1px 2px rgb(var(--shadow-ink) / 0.08)",
        "glow-sm": "0 1px 2px rgb(var(--shadow-ink) / 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
