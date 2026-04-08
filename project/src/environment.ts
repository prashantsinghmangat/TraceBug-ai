// ── Environment snapshot ──────────────────────────────────────────────────
// Captures browser, OS, viewport, device, and network info automatically.
// Zero dependencies — uses navigator and screen APIs.

import { EnvironmentInfo } from "./types";

export function captureEnvironment(): EnvironmentInfo {
  const ua = navigator.userAgent;
  const browser = detectBrowser(ua);
  const os = detectOS(ua);
  const deviceType = detectDeviceType();
  const connection = getConnectionType();

  return {
    browser: browser.name,
    browserVersion: browser.version,
    os,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screenResolution: `${screen.width}x${screen.height}`,
    language: navigator.language || "unknown",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    userAgent: ua,
    url: window.location.href,
    deviceType,
    connectionType: connection,
    timestamp: Date.now(),
  };
}

function detectBrowser(ua: string): { name: string; version: string } {
  const tests: [string, RegExp][] = [
    ["Edge", /Edg(?:e|A|iOS)?\/(\d+[\d.]*)/],
    ["Opera", /(?:OPR|Opera)\/(\d+[\d.]*)/],
    ["Chrome", /Chrome\/(\d+[\d.]*)/],
    ["Firefox", /Firefox\/(\d+[\d.]*)/],
    ["Safari", /Version\/(\d+[\d.]*).*Safari/],
    ["IE", /(?:MSIE |Trident.*rv:)(\d+[\d.]*)/],
  ];

  for (const [name, regex] of tests) {
    const match = ua.match(regex);
    if (match) return { name, version: match[1] };
  }
  return { name: "Unknown", version: "" };
}

function detectOS(ua: string): string {
  if (/Windows NT 10/.test(ua)) return "Windows 10/11";
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Mac OS X (\d+[._]\d+)/.test(ua)) {
    const ver = ua.match(/Mac OS X (\d+[._]\d+)/)?.[1]?.replace(/_/g, ".");
    return `macOS ${ver}`;
  }
  if (/CrOS/.test(ua)) return "Chrome OS";
  if (/Linux/.test(ua)) return "Linux";
  if (/Android (\d+[\d.]*)/.test(ua)) return `Android ${ua.match(/Android (\d+[\d.]*)/)?.[1]}`;
  if (/iPhone|iPad/.test(ua)) {
    const ver = ua.match(/OS (\d+_\d+)/)?.[1]?.replace(/_/g, ".");
    return `iOS ${ver || ""}`;
  }
  return "Unknown OS";
}

function detectDeviceType(): "desktop" | "tablet" | "mobile" {
  const w = window.innerWidth;
  if (/Mobi|Android.*Mobile|iPhone/i.test(navigator.userAgent) || w < 768) return "mobile";
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(navigator.userAgent) || (w >= 768 && w < 1024)) return "tablet";
  return "desktop";
}

function getConnectionType(): string {
  const nav = navigator as any;
  if (nav.connection) {
    const c = nav.connection;
    return c.effectiveType || c.type || "unknown";
  }
  return "unknown";
}
