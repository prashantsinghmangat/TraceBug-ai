// TraceBug logo mark — "Prompt": a terminal chevron + a gradient cursor block,
// set in a deep rounded-square badge. Self-contained (its own dark badge), so it
// reads as a crisp brand mark on either theme. `idPrefix` keeps gradient ids
// unique when multiple marks render on one page.

export function LogoMark({
  size = 32,
  className = "",
  idPrefix = "tb",
}: {
  size?: number;
  className?: string;
  idPrefix?: string;
}) {
  const bg = `${idPrefix}-bg`;
  const cur = `${idPrefix}-cursor`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`flex-shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={bg} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1B1640" />
          <stop offset="100%" stopColor="#0B0B0F" />
        </linearGradient>
        <linearGradient id={cur} x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7C5CFF" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="88" height="88" rx="24" fill={`url(#${bg})`} />
      <rect x="4" y="4" width="88" height="88" rx="24" fill="none" stroke={`url(#${cur})`} strokeWidth="1.2" opacity="0.35" />
      {/* terminal chevron */}
      <path
        d="M30 33 L47 48 L30 63"
        fill="none"
        stroke="#EAECF3"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* cursor block */}
      <rect x="52" y="41" width="14" height="14" rx="4" fill={`url(#${cur})`} />
    </svg>
  );
}

export function LogoLockup({
  size = 30,
  showVersion = false,
  className = "",
  idPrefix = "tb",
}: {
  size?: number;
  showVersion?: boolean;
  className?: string;
  idPrefix?: string;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} idPrefix={idPrefix} />
      <span className="font-semibold text-[16px] tracking-[-0.02em] text-text-primary">
        TraceBug
      </span>
      {showVersion && (
        <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md bg-surface border border-border text-[10px] font-mono uppercase tracking-wider text-text-muted">
          v1.4
        </span>
      )}
    </span>
  );
}
