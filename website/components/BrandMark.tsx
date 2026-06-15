import { useId } from "react";

// The logo's two elements — a terminal chevron + a gradient cursor block —
// extracted as reusable brand motifs so the mark echoes across the site.

// Tiny inline chevron+block, used as the eyebrow prefix on every section.
export function MiniMark({ size = 16, className = "" }: { size?: number; className?: string }) {
  const raw = useId();
  const id = `mm-${raw.replace(/[:]/g, "")}`;
  return (
    <svg
      width={size}
      height={(size * 25) / 32}
      viewBox="0 0 32 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`flex-shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7C5CFF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <path d="M4 5 L11 12.5 L4 20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="15" y="8.5" width="8" height="8" rx="2.2" fill={`url(#${id})`} />
    </svg>
  );
}

// The blinking cursor block — the logo's accent, used as a terminal caret.
export function Caret({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-[3px] bg-[linear-gradient(135deg,#7C5CFF,#22D3EE)] brand-caret ${className}`}
    />
  );
}
