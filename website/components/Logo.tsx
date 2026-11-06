// TraceBug logo mark: the compact cut of the character (Page holding up
// Trace). See components/PageMascot.tsx. `idPrefix` is kept for call-site
// compatibility.

import { SDK_VERSION_TAG } from "@/lib/version";
import PageMascot from "@/components/PageMascot";

export function LogoMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
  idPrefix?: string;
}) {
  return <PageMascot variant="mark" size={size} className={className} />;
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
