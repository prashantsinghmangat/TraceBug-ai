// The site's signature detail: the real capture shortcut, drawn as keycaps.
// Matches `tb-quick-capture` in tracebug-extension/manifest.json (Alt+B).
export default function Shortcut({ className = "" }: { className?: string }) {
  return (
    // No aria-label: it's ignored on a plain <span> by many screen readers (axe: aria-prohibited-attr).
    // The keycaps' own text, "Alt B", is what gets read.
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`}>
      <kbd className="keycap">Alt</kbd>
      <kbd className="keycap">B</kbd>
    </span>
  );
}
