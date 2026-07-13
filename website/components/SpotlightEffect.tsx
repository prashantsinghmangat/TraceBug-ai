"use client";

import { useEffect } from "react";

// One delegated mousemove listener powers every `.spotlight` card on the
// page: it writes the cursor position into --spot-x/--spot-y on the card,
// and the CSS (globals.css) paints a soft indigo radial glow there on hover.
// Renders nothing; passive listener; no per-card React state.
export default function SpotlightEffect() {
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const card = target?.closest?.(".spotlight");
      if (!(card instanceof HTMLElement)) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
      card.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    return () => document.removeEventListener("mousemove", onMove);
  }, []);
  return null;
}
