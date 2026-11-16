"use client";

import { useState } from "react";
import { PlayCircle, Send } from "lucide-react";

// Phones only (the parent hides the store buttons below `sm`). A browser
// extension can't be installed from a phone, so "Add to Chrome" was a dead end
// for social traffic. Instead: watch the demo here, and send yourself the link
// for the desktop (the share sheet where there is one, else the clipboard).

const BTN =
  "col-span-2 inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-5 text-[15px] font-medium transition-[background-color,transform] duration-150 active:scale-[0.98] sm:hidden";
const PRIMARY = "bg-cta text-on-cta hover:bg-cta/85";
const SECONDARY = "border border-border-strong bg-background text-text-primary hover:bg-surface";

const SHARE_URL = "https://tracebug.dev/";

export default function MobileHeroActions() {
  const [label, setLabel] = useState("Send me the link for desktop");

  async function send() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "TraceBug",
          text: "TraceBug: capture a browser bug, let AI fix it. Install it on your computer:",
          url: SHARE_URL,
        });
        return;
      }
      await navigator.clipboard.writeText(SHARE_URL);
      setLabel("Link copied. Open it on your computer");
    } catch {
      // Share sheet dismissed, or the clipboard refused: say nothing happened.
      setLabel("Open tracebug.dev on your computer");
    }
  }

  return (
    <>
      <a href="#demo" className={`${BTN} ${PRIMARY}`}>
        <PlayCircle size={18} strokeWidth={1.75} />
        Watch the 57-second demo
      </a>
      <button type="button" onClick={send} className={`${BTN} ${SECONDARY}`}>
        <Send size={16} strokeWidth={1.75} />
        {label}
      </button>
    </>
  );
}
