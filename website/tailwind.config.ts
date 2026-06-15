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
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "JetBrains Mono", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "grid-dot": "radial-gradient(circle, rgb(var(--border-strong) / 0.7) 1px, transparent 1px)",
        "brand-gradient": "linear-gradient(120deg, #7C5CFF 0%, #6D4AFF 45%, #22D3EE 100%)",
      },
      backgroundSize: {
        "grid-dot": "26px 26px",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-in-out both",
        "slide-up": "slideUp 0.6s cubic-bezier(0.16,1,0.3,1) both",
        marquee: "marquee 34s linear infinite",
        "marquee-slow": "marquee 60s linear infinite",
        aurora: "aurora 18s ease-in-out infinite",
        float: "float 7s ease-in-out infinite",
        "gradient-x": "gradientX 6s ease infinite",
        shimmer: "shimmer 2.4s linear infinite",
        "spin-slow": "spin 14s linear infinite",
        "pulse-ring": "pulseRing 2.4s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(22px)" },
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
        // Light-mode premium shadows — soft, layered, low-opacity. No harsh blacks.
        xs: "0 1px 2px rgb(16 24 40 / 0.04)",
        soft: "0 1px 3px rgb(16 24 40 / 0.05), 0 1px 2px rgb(16 24 40 / 0.04)",
        card: "0 2px 6px rgb(16 24 40 / 0.04), 0 12px 28px -8px rgb(16 24 40 / 0.10)",
        "card-hover": "0 4px 10px rgb(16 24 40 / 0.05), 0 22px 48px -12px rgb(16 24 40 / 0.16)",
        float: "0 24px 60px -16px rgb(76 56 160 / 0.22)",
        "glow-primary": "0 0 0 1px rgb(124 92 255 / 0.18), 0 18px 50px -12px rgb(124 92 255 / 0.40)",
        "glow-sm": "0 6px 18px -6px rgb(124 92 255 / 0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
