// TraceBug logo mark: a terminal prompt with a coral cursor on a midnight
// tile. Same art as the extension icons (tracebug-extension/icons) and the
// favicons (app/icon.svg, public/favicon.svg, public/apple-icon.svg).
// `idPrefix` is kept for call-site compatibility.

import { SDK_VERSION_TAG } from "@/lib/version";

export function LogoMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
  idPrefix?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="90" height="90" rx="22" fill="#0B0D14" />
      <rect x="3.75" y="3.75" width="88.5" height="88.5" rx="21.25" fill="none" stroke="#252A38" strokeWidth="1.5" />
      <path d="M30 33 L47 48 L30 63" stroke="#EEF0F5" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="52" y="41" width="14" height="14" rx="4" fill="#FF5C6C" />
    </svg>
  );
}

export function LogoLockup({
  size = 28,
  showVersion = false,
  className = "",
}: {
  size?: number;
  showVersion?: boolean;
  className?: string;
  idPrefix?: string;
}) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="font-medium text-[16px] text-text-primary">TraceBug</span>
      {showVersion && (
        <span className="hidden sm:inline font-mono text-[12px] text-text-subtle">{SDK_VERSION_TAG}</span>
      )}
    </span>
  );
}
