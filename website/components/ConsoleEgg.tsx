"use client";

import { useEffect } from "react";

// Our users open DevTools for a living — greet them there. Pixel Trace in
// ASCII + a nudge to report site bugs the TraceBug way. Runs once per load;
// renders nothing.
const SPRITE = [
  "  ▐▌      ▐▌  ",
  "   ▐▌    ▐▌   ",
  "  ▄▟██████▙▄  ",
  "▐█ ██ ▐▌ ██ █▌",
  "▐█ ████████ █▌",
  "  ▀▜██████▛▀  ",
  "      ██      ",
].join("\n");

let fired = false;

export default function ConsoleEgg() {
  useEffect(() => {
    if (fired) return; // StrictMode double-mounts in dev — greet once
    fired = true;
    try {
      // eslint-disable-next-line no-console
      console.log(
        `%c${SPRITE}\n\n%c👾 Trace here. You opened DevTools — respect.%c\n\nFound a bug on this site? Catch it properly:\nhttps://github.com/prashantsinghmangat/tracebug-ai/issues/new\n\nOr catch bugs everywhere else: https://tracebug.dev`,
        "color:#6366F1; font-family:monospace; font-weight:bold; line-height:1.15;",
        "color:#818CF8; font-size:13px; font-weight:600;",
        "color:#71717A; font-size:12px;"
      );
    } catch {
      /* console may be locked down — never break the page for an easter egg */
    }
  }, []);
  return null;
}
