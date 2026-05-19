import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cyber-graphite palette — same family as Linear / Vercel / Raycast.
        // Deliberately desaturated darks; only the violet/cyan accents pop.
        background: "#0B0D10",
        surface: "#11151A",
        "surface-2": "#161B22",
        border: "#1F2630",
        "border-strong": "#2A3441",
        primary: "#7C5CFF",
        "primary-soft": "#7C5CFF1A",
        accent: "#00D9FF",
        success: "#22C55E",
        error: "#FF5D73",
        warning: "#F59E0B",
        "text-primary": "#E6EDF3",
        "text-muted": "#94A3B8",
        "text-subtle": "#64748B",
      },
      fontFamily: {
        // Wired up via the `geist` package in app/layout.tsx — its default
        // variables are --font-geist-sans + --font-geist-mono.
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "JetBrains Mono", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        // Subtle dot grid for backgrounds — devtool-y without being noisy.
        "grid-dot": "radial-gradient(circle, #1F2630 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid-dot": "24px 24px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.5s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      boxShadow: {
        // Glows tuned for the new violet (#7C5CFF) — pulled back from the
        // previous bright bloom to feel more like a backlit terminal.
        "glow-primary": "0 0 32px rgba(124, 92, 255, 0.22)",
        "glow-accent": "0 0 32px rgba(0, 217, 255, 0.22)",
        "glow-sm": "0 0 12px rgba(124, 92, 255, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
