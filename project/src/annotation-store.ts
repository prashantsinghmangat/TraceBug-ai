// ── Centralized annotation store ──────────────────────────────────────────
// In-memory store for element annotations and draw regions.
// Handles persistence, export (JSON/Markdown), and clipboard.

import { ElementAnnotation, DrawRegion, UIAnnotationReport } from "./types";

let _elementAnnotations: ElementAnnotation[] = [];
let _drawRegions: DrawRegion[] = [];

// ── CRUD ──────────────────────────────────────────────────────────────────

export function addElementAnnotation(ann: ElementAnnotation): void {
  _elementAnnotations.push(ann);
}

export function addDrawRegion(region: DrawRegion): void {
  _drawRegions.push(region);
}

export function removeAnnotationById(id: string): void {
  _elementAnnotations = _elementAnnotations.filter(a => a.id !== id);
  _drawRegions = _drawRegions.filter(r => r.id !== id);
}

export function getElementAnnotations(): ElementAnnotation[] {
  return _elementAnnotations;
}

export function getDrawRegions(): DrawRegion[] {
  return _drawRegions;
}

export function getAnnotationReport(): UIAnnotationReport {
  return {
    elementAnnotations: [..._elementAnnotations],
    drawRegions: [..._drawRegions],
    page: typeof window !== "undefined" ? window.location.pathname : "",
    timestamp: Date.now(),
  };
}

export function clearAllAnnotations(): void {
  _elementAnnotations = [];
  _drawRegions = [];
}

export function getAnnotationCount(): number {
  return _elementAnnotations.length + _drawRegions.length;
}

// ── Export ─────────────────────────────────────────────────────────────────

export function exportAsJSON(): string {
  return JSON.stringify(getAnnotationReport(), null, 2);
}

export function exportAsMarkdown(): string {
  const lines: string[] = [];
  lines.push("# UI Annotations Report");
  lines.push(`**Page:** ${window.location.href}`);
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Total:** ${_elementAnnotations.length} element annotations, ${_drawRegions.length} draw regions`);
  lines.push("");

  if (_elementAnnotations.length > 0) {
    lines.push("## Element Annotations");
    lines.push("");
    for (let i = 0; i < _elementAnnotations.length; i++) {
      const a = _elementAnnotations[i];
      const intentLabel = a.intent.charAt(0).toUpperCase() + a.intent.slice(1);
      const sevLabel = a.severity.charAt(0).toUpperCase() + a.severity.slice(1);
      lines.push(`### ${i + 1}. [${intentLabel.toUpperCase()}] \`${a.selector.slice(0, 60)}\` (${sevLabel})`);
      lines.push(`- **Element:** \`<${a.tagName}>\` "${a.innerText.slice(0, 80)}"`);
      lines.push(`- **Comment:** ${a.comment}`);
      lines.push(`- **Page:** ${a.page}`);
      lines.push("");
    }
  }

  if (_drawRegions.length > 0) {
    lines.push("## Draw Regions");
    lines.push("");
    for (let i = 0; i < _drawRegions.length; i++) {
      const r = _drawRegions[i];
      const shapeLabel = r.shape === "rect" ? "Rectangle" : "Ellipse";
      lines.push(`### ${i + 1}. ${shapeLabel} at (${Math.round(r.x)}, ${Math.round(r.y)}) ${Math.round(r.width)}x${Math.round(r.height)}`);
      lines.push(`- **Comment:** ${r.comment || "(no comment)"}`);
      lines.push(`- **Page:** ${r.page}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export async function copyToClipboard(format: "json" | "markdown"): Promise<boolean> {
  const text = format === "json" ? exportAsJSON() : exportAsMarkdown();
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for contexts where clipboard API fails
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      return true;
    } catch {
      return false;
    } finally {
      ta.remove();
    }
  }
}
