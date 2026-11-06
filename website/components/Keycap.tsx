// The site's signature detail: the real capture shortcut, drawn as keycaps.
// Matches `tb-quick-capture` in tracebug-extension/manifest.json (Alt+B).
export default function Shortcut({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`} aria-label="Alt plus B">
      <kbd className="keycap">Alt</kbd>
      <kbd className="keycap">B</kbd>
    </span>
  );
}
