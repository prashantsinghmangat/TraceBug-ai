// TraceBug brand icon library — all icons at 24×24 viewBox
// Consistent with the TraceBug extended icon set (hexagonal bug + circuit trace aesthetic)

export function IconBugReport({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3 L17 6 L17 13 L12 16 L7 13 L7 6 Z" stroke="#7B61FF" strokeWidth="1.5" fill="rgba(123,97,255,0.1)"/>
      <rect x="5" y="9.5" width="14" height="1.5" rx="0.75" fill="#00E5FF" opacity="0.85"/>
      <line x1="9" y1="6" x2="5" y2="2" stroke="#9B7DFF" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="5" cy="2" r="1.3" fill="#9B7DFF"/>
      <line x1="15" y1="6" x2="19" y2="2" stroke="#00E5FF" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="19" cy="2" r="1.3" fill="#00E5FF"/>
      <line x1="7" y1="8" x2="3" y2="7" stroke="#7B61FF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="7" y1="11" x2="2" y2="11" stroke="#7B61FF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="17" y1="8" x2="21" y2="7" stroke="#00E5FF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="17" y1="11" x2="22" y2="11" stroke="#00E5FF" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="12" cy="10" r="1.5" fill="#7B61FF"/>
      <line x1="9" y1="16" x2="12" y2="20" stroke="#7B61FF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="15" y1="16" x2="12" y2="20" stroke="#00E5FF" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="12" cy="21" r="1.2" fill="#7B61FF"/>
    </svg>
  );
}

export function IconRecord({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#7B61FF" strokeWidth="1.5"/>
      <circle cx="12" cy="12" r="5" fill="#FF4D6D"/>
      <circle cx="12" cy="12" r="2" fill="white" opacity="0.9"/>
      <circle cx="17" cy="7" r="2.5" fill="#FF4D6D"/>
      <circle cx="17" cy="7" r="1" fill="white"/>
    </svg>
  );
}

export function IconReplay({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="14" rx="2" stroke="#7B61FF" strokeWidth="1.5" fill="rgba(123,97,255,0.06)"/>
      <path d="M10 9 L15 12 L10 15 Z" fill="#00E5FF"/>
      <line x1="6" y1="20" x2="18" y2="20" stroke="#7B61FF" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="19" cy="7" r="3" fill="#111118" stroke="#FF4D6D" strokeWidth="1.2"/>
      <circle cx="19" cy="7" r="1.2" fill="#FF4D6D"/>
    </svg>
  );
}

export function IconConsole({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="3" width="20" height="18" rx="2" stroke="#7B61FF" strokeWidth="1.5" fill="rgba(123,97,255,0.06)"/>
      <rect x="2" y="3" width="20" height="5" rx="2" fill="rgba(123,97,255,0.15)"/>
      <circle cx="5.5" cy="5.5" r="1" fill="#FF4D6D"/>
      <circle cx="8.5" cy="5.5" r="1" fill="#FFD166"/>
      <circle cx="11.5" cy="5.5" r="1" fill="#00FFA3"/>
      <path d="M6 13 L9 11 L6 9" stroke="#00E5FF" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <line x1="11" y1="13" x2="17" y2="13" stroke="#7B61FF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="6" y1="16" x2="14" y2="16" stroke="#6B6B80" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="18" cy="18" r="2.5" fill="#FF4D6D"/>
      <path d="M17.2 18 L18.8 18M18 17.2 L18 18.8" stroke="white" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  );
}

export function IconScreenshot({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="#7B61FF" strokeWidth="1.5" fill="rgba(123,97,255,0.06)"/>
      <circle cx="12" cy="12" r="3.5" stroke="#00E5FF" strokeWidth="1.3"/>
      <circle cx="12" cy="12" r="1.5" fill="#00E5FF" opacity="0.7"/>
      <path d="M2 8 L6 4" stroke="#7B61FF" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M22 8 L18 4" stroke="#7B61FF" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M2 16 L6 20" stroke="#7B61FF" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M22 16 L18 20" stroke="#7B61FF" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="18" cy="6" r="1.5" fill="#FF4D6D"/>
    </svg>
  );
}

export function IconVoice({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="11" rx="3" stroke="#7B61FF" strokeWidth="1.5" fill="rgba(123,97,255,0.1)"/>
      <path d="M5 11 C5 15.4 8.1 19 12 19 C15.9 19 19 15.4 19 11" stroke="#00E5FF" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <line x1="12" y1="19" x2="12" y2="22" stroke="#7B61FF" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9" y1="22" x2="15" y2="22" stroke="#7B61FF" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="19" cy="5" r="2.5" fill="#FF4D6D"/>
      <circle cx="19" cy="5" r="1" fill="white"/>
    </svg>
  );
}

export function IconGitHub({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.164 6.839 9.49.5.09.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.532 1.032 1.532 1.032.892 1.528 2.341 1.087 2.912.831.092-.647.35-1.087.636-1.337-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.03-2.682-.103-.254-.448-1.27.098-2.645 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.548 1.375.203 2.391.1 2.645.64.698 1.028 1.591 1.028 2.682 0 3.841-2.337 4.687-4.565 4.935.359.309.678.919.678 1.852 0 1.337-.012 2.415-.012 2.743 0 .267.18.577.688.48C19.137 20.16 22 16.416 22 12c0-5.523-4.477-10-10-10z" fill="#9B7DFF" opacity="0.9"/>
      <circle cx="19" cy="5" r="3" fill="#111118" stroke="#00FFA3" strokeWidth="1.2"/>
      <path d="M17.8 5.2 L19 6.2 L20.5 4" stroke="#00FFA3" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

export function IconJira({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="rgba(0,83,204,0.15)" stroke="#0053CC" strokeWidth="1.3"/>
      <path d="M12 5 L19 12 L12 19" stroke="#0C66E4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M5 5 L12 12 L5 19" stroke="#579DFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="19" cy="5" r="3" fill="#111118" stroke="#00E5FF" strokeWidth="1.2"/>
      <path d="M18 5 L19.5 6 L21 4" stroke="#00E5FF" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

export function IconExtension({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M20.5 11 L20.5 8.5 L18 8.5 C18 7 16.8 5.8 15.3 5.8 C13.8 5.8 12.6 7 12.6 8.5 L10 8.5 L10 11 C8.5 11 7.3 12.2 7.3 13.7 C7.3 15.2 8.5 16.4 10 16.4 L10 19 L20.5 19 L20.5 16.4 C22 16.4 23.2 15.2 23.2 13.7 C23.2 12.2 22 11 20.5 11 Z" stroke="#7B61FF" strokeWidth="1.4" fill="rgba(123,97,255,0.08)"/>
      <rect x="2" y="4" width="7" height="16" rx="1.5" stroke="#00E5FF" strokeWidth="1.3" fill="rgba(0,229,255,0.06)"/>
      <line x1="3.5" y1="8" x2="7.5" y2="8" stroke="#00E5FF" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
      <line x1="3.5" y1="11" x2="7.5" y2="11" stroke="#00E5FF" strokeWidth="1" strokeLinecap="round" opacity="0.4"/>
    </svg>
  );
}

export function IconExport({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="14" height="18" rx="2" stroke="#7B61FF" strokeWidth="1.5" fill="rgba(123,97,255,0.06)"/>
      <path d="M14 3 L21 10" stroke="#7B61FF" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M14 3 L14 10 L21 10" stroke="#7B61FF" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
      <line x1="7" y1="13" x2="13" y2="13" stroke="#00E5FF" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="7" y1="16" x2="11" y2="16" stroke="#6B6B80" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="19" cy="18" r="4" fill="#00FFA3"/>
      <path d="M17.5 18 L19 19.5 L21 16.5" stroke="#001A10" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

export function IconNetwork({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#7B61FF" strokeWidth="1.5" strokeDasharray="2 2"/>
      <circle cx="12" cy="12" r="5.5" stroke="#00E5FF" strokeWidth="1" opacity="0.5"/>
      <circle cx="12" cy="12" r="2" fill="#7B61FF"/>
      <line x1="12" y1="3" x2="12" y2="6" stroke="#7B61FF" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="18" x2="12" y2="21" stroke="#7B61FF" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="3" y1="12" x2="6" y2="12" stroke="#00E5FF" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="18" y1="12" x2="21" y2="12" stroke="#00E5FF" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5.6" y1="5.6" x2="7.8" y2="7.8" stroke="#9B7DFF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="18.4" y1="18.4" x2="16.2" y2="16.2" stroke="#9B7DFF" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="19" cy="5" r="2" fill="#00FFA3"/>
      <circle cx="19" cy="5" r="0.8" fill="#001A10"/>
    </svg>
  );
}

export function IconTimeline({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <line x1="4" y1="12" x2="20" y2="12" stroke="#7B61FF" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="6" cy="12" r="2.5" fill="#7B61FF" stroke="#111118" strokeWidth="1"/>
      <circle cx="12" cy="12" r="2.5" fill="#00E5FF" stroke="#111118" strokeWidth="1"/>
      <circle cx="18" cy="12" r="2.5" fill="#9B7DFF" stroke="#111118" strokeWidth="1"/>
      <line x1="6" y1="7" x2="6" y2="9.5" stroke="#7B61FF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="12" y1="14.5" x2="12" y2="17" stroke="#00E5FF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="18" y1="7" x2="18" y2="9.5" stroke="#9B7DFF" strokeWidth="1.2" strokeLinecap="round"/>
      <rect x="3" y="5" width="6" height="2" rx="1" fill="rgba(123,97,255,0.3)" stroke="#7B61FF" strokeWidth="0.8"/>
      <rect x="15" y="5" width="6" height="2" rx="1" fill="rgba(155,125,255,0.2)" stroke="#9B7DFF" strokeWidth="0.8"/>
    </svg>
  );
}

export function IconEnvironment({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="3" width="20" height="14" rx="2" stroke="#7B61FF" strokeWidth="1.4" fill="rgba(123,97,255,0.06)"/>
      <line x1="8" y1="21" x2="16" y2="21" stroke="#7B61FF" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="12" y1="17" x2="12" y2="21" stroke="#7B61FF" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="6" cy="7" r="1.2" fill="#FF4D6D"/>
      <circle cx="9.5" cy="7" r="1.2" fill="#FFD166"/>
      <circle cx="13" cy="7" r="1.2" fill="#00FFA3"/>
      <line x1="5" y1="11" x2="10" y2="11" stroke="#7B61FF" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <line x1="5" y1="13.5" x2="14" y2="13.5" stroke="#00E5FF" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

export function IconError({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#FF4D6D" strokeWidth="1.5" fill="rgba(255,77,109,0.08)"/>
      <line x1="12" y1="7" x2="12" y2="13" stroke="#FF4D6D" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="16.5" r="1.3" fill="#FF4D6D"/>
      <circle cx="19" cy="5" r="3" fill="#FF4D6D" opacity="0.2" stroke="#FF4D6D" strokeWidth="1"/>
      <line x1="18" y1="4" x2="20" y2="6" stroke="#FF4D6D" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="20" y1="4" x2="18" y2="6" stroke="#FF4D6D" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function IconStackTrace({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="3" width="20" height="18" rx="2" stroke="#7B61FF" strokeWidth="1.4" fill="rgba(123,97,255,0.06)"/>
      <line x1="5" y1="8" x2="14" y2="8" stroke="#FF4D6D" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="7" y1="11" x2="16" y2="11" stroke="#FFD166" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="9" y1="14" x2="17" y2="14" stroke="#9B7DFF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="11" y1="17" x2="18" y2="17" stroke="#6B6B80" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="5" cy="8" r="1.2" fill="#FF4D6D"/>
      <circle cx="7" cy="11" r="1.2" fill="#FFD166"/>
      <circle cx="9" cy="14" r="1.2" fill="#9B7DFF"/>
      <circle cx="11" cy="17" r="1.2" fill="#6B6B80"/>
    </svg>
  );
}

export function IconPerformance({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 17 L8 11 L12 14 L17 7 L21 11" stroke="#00FFA3" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="21" cy="11" r="2" fill="#00FFA3"/>
      <line x1="3" y1="20" x2="21" y2="20" stroke="#6B6B80" strokeWidth="1.2" strokeLinecap="round"/>
      <rect x="5" y="17" width="2" height="3" rx="0.5" fill="#7B61FF" opacity="0.4"/>
      <rect x="10" y="14" width="2" height="6" rx="0.5" fill="#9B7DFF" opacity="0.4"/>
      <rect x="15" y="11" width="2" height="9" rx="0.5" fill="#00E5FF" opacity="0.4"/>
    </svg>
  );
}

export function IconAnalytics({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <line x1="3" y1="20" x2="21" y2="20" stroke="#6B6B80" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="3" y1="20" x2="3" y2="4" stroke="#6B6B80" strokeWidth="1.3" strokeLinecap="round"/>
      <rect x="6" y="14" width="3" height="6" rx="1" fill="#7B61FF" opacity="0.8"/>
      <rect x="11" y="9" width="3" height="11" rx="1" fill="#9B7DFF" opacity="0.8"/>
      <rect x="16" y="5" width="3" height="15" rx="1" fill="#00E5FF" opacity="0.7"/>
      <path d="M6 12 L10 8 L14 10 L18 4" stroke="#00FFA3" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="18" cy="4" r="1.5" fill="#00FFA3"/>
    </svg>
  );
}

export function IconInstall({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3 L12 15" stroke="#7B61FF" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M8 11 L12 15 L16 11" stroke="#7B61FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M4 17 L4 20 C4 20.6 4.4 21 5 21 L19 21 C19.6 21 20 20.6 20 20 L20 17" stroke="#00E5FF" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <line x1="8" y1="19" x2="16" y2="19" stroke="#00E5FF" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

export function IconDashboard({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="9" height="9" rx="2" stroke="#7B61FF" strokeWidth="1.4" fill="rgba(123,97,255,0.1)"/>
      <rect x="13" y="2" width="9" height="9" rx="2" stroke="#00E5FF" strokeWidth="1.4" fill="rgba(0,229,255,0.08)"/>
      <rect x="2" y="13" width="9" height="9" rx="2" stroke="#9B7DFF" strokeWidth="1.4" fill="rgba(155,125,255,0.08)"/>
      <rect x="13" y="13" width="9" height="9" rx="2" stroke="#6B6B80" strokeWidth="1.4" fill="rgba(107,107,128,0.06)"/>
      <circle cx="6.5" cy="6.5" r="1.5" fill="#7B61FF"/>
      <circle cx="17.5" cy="6.5" r="1.5" fill="#00E5FF"/>
      <line x1="14.5" y1="17.5" x2="20.5" y2="17.5" stroke="#6B6B80" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="14.5" y1="20" x2="18.5" y2="20" stroke="#6B6B80" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M4 20.5 L6 18 L8 19.5 L10 17" stroke="#9B7DFF" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

export function IconShare({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="18" cy="5" r="3" stroke="#7B61FF" strokeWidth="1.5"/>
      <circle cx="6" cy="12" r="3" stroke="#00E5FF" strokeWidth="1.5"/>
      <circle cx="18" cy="19" r="3" stroke="#9B7DFF" strokeWidth="1.5"/>
      <line x1="8.7" y1="10.7" x2="15.3" y2="6.3" stroke="#7B61FF" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="8.7" y1="13.3" x2="15.3" y2="17.7" stroke="#9B7DFF" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

export function IconTrace({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="4" cy="12" r="2.5" fill="#7B61FF" opacity="0.8"/>
      <circle cx="12" cy="6" r="2.5" fill="#9B7DFF" opacity="0.8"/>
      <circle cx="20" cy="12" r="2.5" fill="#00E5FF" opacity="0.8"/>
      <circle cx="12" cy="18" r="2.5" fill="#FFD166" opacity="0.8"/>
      <line x1="6.5" y1="12" x2="9.5" y2="6" stroke="#7B61FF" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 1.5"/>
      <line x1="14.5" y1="6" x2="17.5" y2="12" stroke="#9B7DFF" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 1.5"/>
      <line x1="17.5" y1="14" x2="14.5" y2="18" stroke="#00E5FF" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 1.5"/>
      <line x1="9.5" y1="18" x2="6.5" y2="14" stroke="#FFD166" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 1.5"/>
      <circle cx="12" cy="12" r="2" fill="#7B61FF"/>
      <circle cx="12" cy="12" r="0.8" fill="white"/>
    </svg>
  );
}

// Status icons
export function IconCritical({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2 L22 20 L2 20 Z" fill="rgba(255,77,109,0.15)" stroke="#FF4D6D" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="12" y1="9" x2="12" y2="14" stroke="#FF4D6D" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="12" cy="17" r="1.2" fill="#FF4D6D"/>
    </svg>
  );
}

export function IconResolved({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#00FFA3" strokeWidth="1.5" fill="rgba(0,255,163,0.1)"/>
      <path d="M7.5 12 L10.5 15 L16.5 9" stroke="#00FFA3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

export function IconHTTPRequest({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="8" width="20" height="8" rx="2" stroke="#7B61FF" strokeWidth="1.4" fill="rgba(123,97,255,0.06)"/>
      <rect x="2" y="3" width="6" height="5" rx="1" fill="rgba(0,229,255,0.15)" stroke="#00E5FF" strokeWidth="1.1"/>
      <text x="5" y="7.2" textAnchor="middle" fontSize="3.5" fontFamily="monospace" fill="#00E5FF" fontWeight="700">GET</text>
      <line x1="5" y1="12" x2="9" y2="12" stroke="#00E5FF" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="11" y1="12" x2="19" y2="12" stroke="#6B6B80" strokeWidth="1.1" strokeLinecap="round"/>
      <circle cx="19" cy="18" r="3.5" fill="#111118" stroke="#00FFA3" strokeWidth="1.2"/>
      <text x="19" y="20" textAnchor="middle" fontSize="4" fontFamily="monospace" fill="#00FFA3" fontWeight="700">200</text>
    </svg>
  );
}

// Click / cursor icon for "User Clicks" in Solution section
export function IconClick({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 3 L5 16 L8.5 13 L11 18 L13 17 L10.5 12 L15 12 Z" stroke="#7B61FF" strokeWidth="1.4" strokeLinejoin="round" fill="rgba(123,97,255,0.1)"/>
      <circle cx="19" cy="5" r="2.5" fill="#00E5FF" opacity="0.25" stroke="#00E5FF" strokeWidth="1"/>
      <circle cx="19" cy="5" r="1" fill="#00E5FF"/>
      <line x1="19" y1="1.5" x2="19" y2="3" stroke="#00E5FF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="19" y1="7" x2="19" y2="8.5" stroke="#00E5FF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="15.5" y1="5" x2="17" y2="5" stroke="#00E5FF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="21" y1="5" x2="22.5" y2="5" stroke="#00E5FF" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

// Privacy / Shield icon for auto-redaction
export function IconPrivacy({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2 L20 6 L20 12 C20 16.4 16.4 20.5 12 22 C7.6 20.5 4 16.4 4 12 L4 6 Z" stroke="#7B61FF" strokeWidth="1.5" fill="rgba(123,97,255,0.08)"/>
      <path d="M8.5 12 L11 14.5 L15.5 10" stroke="#00FFA3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}
