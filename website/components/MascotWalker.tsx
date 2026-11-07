"use client";

import { LINKS } from "@/lib/site";
import { Logo } from "@/components/ui/logos";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import PageMascot from "@/components/PageMascot";

const DISMISS_KEY = "tracebug-walker-dismissed";
const SIZE = 132;

// Pages where a wandering character would get in the way of real work.
const HIDDEN_ON = ["/dashboard", "/share", "/auth", "/sdk-bridge", "/bye"];

// What Page says while walking, by how far down the page the reader is.
const WALK_LINES = [
  "I catch browser bugs. Want me in Chrome?",
  "Press Alt B and I write the bug report",
  "Your AI agent reads me over MCP",
  "Add me to Chrome, it's free",
];

// What Page explains when you drop it on a section (by section id).
const DROP_LINES: Record<string, string> = {
  demo: "That's me on a real checkout bug. Press play, it's 57 seconds",
  how: "Capture, share, fix. You press Alt B, I do the writing",
  features: "Pick one on the left. I do all of these, quietly",
  report: "This is what I hand over: steps, console, network, screenshot",
  integrations: "GitHub, Linear, Slack, Jira, your AI. I go wherever you send me",
  mcp: "Your agent opens me through this. One command, nothing uploaded",
  faq: "Ask away. Short version: free, local, no account",
  install: "Right here. One click and I live in your browser",
};
const DEFAULT_DROP = "I'll catch bugs anywhere you put me. Double-click and I go back to walking";

// Click lines cycle when you poke Page without dragging it.
const POKE_LINES = [
  "Hey! Drag me onto a section and I'll explain it",
  "Trace says hi. It's the bug I caught",
  "Double-click me to send me back to walking",
];

type Mode = "follow" | "dragging" | "placed";

// The character walks along the bottom of the screen as you scroll, turning
// to face the scroll direction and only moving its legs while the page moves.
// You can pick it up and drop it anywhere: it then stays put and explains the
// section it landed on. Double-click sends it back to walking. Hidden on
// phones, steps aside when another copy of the character is on screen, and
// can be dismissed (remembered per browser). Reduced motion: no limb motion.
export default function MascotWalker() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(true);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [walking, setWalking] = useState(false);
  const [mode, setMode] = useState<Mode>("follow");
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [line, setLine] = useState<string | null>(null);
  const lastY = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef({ dx: 0, dy: 0, startX: 0, startY: 0, lastX: 0, moved: false });
  const poke = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    if (dismissed) return;
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      setProgress(p);
      // Step aside while another copy of the character is on screen.
      const twinInView = Array.from(document.querySelectorAll("svg.pm")).some((el) => {
        if (el.closest(".mascot-walker")) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
      });
      setVisible(y > window.innerHeight * 0.6 && p < 0.96 && !twinInView);
      if (Math.abs(y - lastY.current) > 2) {
        setFacing(y > lastY.current ? 1 : -1);
        setWalking(true);
        if (stopTimer.current) clearTimeout(stopTimer.current);
        stopTimer.current = setTimeout(() => setWalking(false), 220);
      }
      lastY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (stopTimer.current) clearTimeout(stopTimer.current);
    };
  }, [dismissed]);

  if (dismissed || HIDDEN_ON.some((p) => pathname?.startsWith(p))) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  // ── drag and drop ────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    drag.current = {
      dx: e.clientX - box.left,
      dy: e.clientY - box.top,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const d = drag.current;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
    if (!d.moved) {
      d.moved = true;
      setMode("dragging");
      setLine(null);
    }
    if (Math.abs(e.clientX - d.lastX) > 1) setFacing(e.clientX > d.lastX ? 1 : -1);
    d.lastX = e.clientX;
    setPos({
      x: Math.min(window.innerWidth - SIZE, Math.max(0, e.clientX - d.dx)),
      y: Math.min(window.innerHeight - SIZE, Math.max(0, e.clientY - d.dy)),
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (!drag.current.moved) {
      // a click, not a drag: Page answers
      setLine(POKE_LINES[poke.current++ % POKE_LINES.length]);
      return;
    }
    setMode("placed");
    // Which section did it land on? Look underneath the character itself.
    const under = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((el) => !rootRef.current?.contains(el));
    const id = under?.closest("section[id]")?.id ?? "";
    setLine(DROP_LINES[id] ?? DEFAULT_DROP);
  };

  const backToWalking = () => {
    setMode("follow");
    setLine(null);
  };

  // ── layout ───────────────────────────────────────────────────
  const free = mode !== "follow";
  const bubbleText = line ?? WALK_LINES[Math.min(WALK_LINES.length - 1, Math.floor(progress * WALK_LINES.length))];
  const onRight = free ? pos.x > window.innerWidth / 2 : progress > 0.5;
  const bubbleBelow = free && pos.y < 170;

  const rootStyle: React.CSSProperties = free
    ? { left: pos.x, top: pos.y, opacity: 1, visibility: "visible" }
    : {
        left: 16,
        bottom: 8,
        transform: `translateX(calc(${progress} * (100vw - 2rem - ${SIZE}px))) translateY(${visible ? 0 : 24}px)`,
        opacity: visible ? 1 : 0,
        visibility: visible ? "visible" : "hidden",
        transition:
          "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms cubic-bezier(0.22, 1, 0.36, 1), visibility 200ms",
      };

  return (
    <div
      ref={rootRef}
      className="mascot-walker pointer-events-none fixed z-40 hidden sm:block"
      style={rootStyle}
    >
      {/* speech bubble */}
      {mode !== "dragging" && (
        <div
          className={`pointer-events-auto absolute w-[256px] rounded-xl border border-border bg-background p-3 shadow-float transition-opacity duration-200 ${
            onRight ? "right-0" : "left-0"
          } ${bubbleBelow ? "top-[140px]" : "bottom-[116px]"} ${walking && !free ? "opacity-0" : "opacity-100"}`}
          role="complementary"
          aria-label="TraceBug Chrome extension"
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="Hide the TraceBug character"
            className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface hover:text-text-primary"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
          <p className="pr-6 text-[14px] leading-[1.45] text-text-primary">{bubbleText}</p>
          <div className="mt-3 flex items-center gap-3">
            <a
              href={LINKS.chrome}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-cta px-3 text-[13px] font-medium text-on-cta transition-colors hover:bg-cta/85"
            >
              <Logo name="chrome" size={14} />
              Add to Chrome, free
            </a>
            {free && (
              <button
                type="button"
                onClick={backToWalking}
                className="text-[13px] text-text-muted underline-offset-2 hover:text-text-primary hover:underline"
              >
                Walk again
              </button>
            )}
          </div>
          <span
            className={`absolute h-3 w-3 rotate-45 bg-background ${
              bubbleBelow ? "-top-[7px] border-l border-t" : "-bottom-[7px] border-b border-r"
            } border-border ${onRight ? "right-14" : "left-14"}`}
            aria-hidden="true"
          />
        </div>
      )}

      {/* the character: drag to move, click to talk, double-click to walk again */}
      <div
        className={`pointer-events-auto select-none touch-none ${mode === "dragging" ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={backToWalking}
        title="Drag me onto a section"
        style={{
          transform: `scaleX(${facing}) ${mode === "dragging" ? "rotate(-6deg) scale(1.06)" : ""}`,
          transition: "transform 160ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <PageMascot size={SIZE} motion={mode === "dragging" || (walking && !free) ? "walk" : "wave"} />
      </div>
    </div>
  );
}
