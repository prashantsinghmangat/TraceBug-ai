// Real brand icons used across the site. Inlined SVGs (paths from simple-icons,
// MIT) so we don't pull a 3000-icon dependency just for 4 logos.
//
// Each icon supports a `colored` prop:
//   - default (false) → monochrome via currentColor, harmonizes with dark theme
//   - colored=true    → full brand colors, for moments where brand recognition matters
//                        (Hero CTA, FinalCTA install button)

import * as React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  colored?: boolean;
}

export function ChromeIcon({ size = 16, colored = false, ...props }: IconProps) {
  if (colored) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        aria-hidden="true"
        {...props}
      >
        <circle cx="12" cy="12" r="11" fill="#fff" />
        <path d="M12 2a10 10 0 0 1 8.66 5H12a5 5 0 0 0-4.33 7.5L3.34 7A10 10 0 0 1 12 2z" fill="#EA4335" />
        <path d="M12 22a10 10 0 0 1-8.66-5L7.67 9.5A5 5 0 0 0 12 17h8.66A10 10 0 0 1 12 22z" fill="#34A853" />
        <path d="M22 12a10 10 0 0 1-1.34 5L16.33 9.5A5 5 0 0 1 17 12a5 5 0 0 1-.67 2.5L20.66 7A10 10 0 0 1 22 12z" fill="#FBBC05" />
        <circle cx="12" cy="12" r="4" fill="#4285F4" />
      </svg>
    );
  }
  // Monochrome — single outline path
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="21.17" y1="8" x2="12" y2="8" />
      <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
      <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
    </svg>
  );
}

export function GitHubIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export function NpmIcon({ size = 16, colored = false, ...props }: IconProps) {
  // The npm "N in a box" mark always reads as the npm logo. When
  // `colored`, render filled with brand red. Otherwise stroke-only so it
  // matches the muted dark theme.
  if (colored) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden="true"
        {...props}
      >
        <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0H1.763zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
      <path d="M7 17V9h4v8M11 9h2v8h2V9h2v8" strokeLinecap="round" />
    </svg>
  );
}

export function TerminalIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}
