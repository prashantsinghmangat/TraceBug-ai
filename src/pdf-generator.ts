// ── PDF report generator ──────────────────────────────────────────────────
// Generates a downloadable PDF bug report.
// Creates a print-optimized HTML document and triggers browser print dialog.
// Zero runtime dependencies — uses browser's built-in print-to-PDF.

import { BugReport } from "./types";

export function generatePdfReport(report: BugReport): void {
  const html = buildPdfHtml(report);

  // Open in new window and trigger print
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    // Popup blocked — fallback to download as HTML
    downloadAsHtml(html, `tracebug-report-${report.session.sessionId.slice(0, 8)}.html`);
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for content to render, then print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };
}

export function downloadPdfAsHtml(report: BugReport): void {
  const html = buildPdfHtml(report);
  downloadAsHtml(html, `tracebug-report-${report.session.sessionId.slice(0, 8)}.html`);
}

function buildPdfHtml(report: BugReport): string {
  const env = report.environment;
  const session = report.session;
  const hasError = report.consoleErrors.length > 0;

  let html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>TraceBug Report — ${escapeHtml(report.title)}</title>
<style>
  @page { margin: 20mm 15mm; size: A4; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #1a1a2e; line-height: 1.5; padding: 24px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 20px; color: #0f0f1a; margin-bottom: 4px; border-bottom: 2px solid #ef4444; padding-bottom: 8px; }
  h2 { font-size: 15px; color: #1a1a2e; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e0e0e0; }
  .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
  .badge { display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
  .badge-error { background: #fee2e2; color: #dc2626; }
  .badge-success { background: #dcfce7; color: #16a34a; }
  .badge-warn { background: #fef3c7; color: #d97706; }
  .env-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 12px 0; }
  .env-item { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px; }
  .env-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .env-value { font-size: 13px; color: #1a1a2e; margin-top: 2px; }
  .steps { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin: 12px 0; }
  .steps pre { white-space: pre-wrap; font-size: 12px; line-height: 1.8; font-family: inherit; }
  .error-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; margin: 12px 0; }
  .error-msg { color: #dc2626; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
  .stack { font-family: monospace; font-size: 10px; color: #666; white-space: pre-wrap; max-height: 150px; overflow: auto; background: #fff5f5; padding: 8px; border-radius: 4px; margin-top: 6px; }
  .network-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px; }
  .network-table th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
  .network-table td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
  .network-table tr.error td { background: #fef2f2; }
  .timeline { margin: 12px 0; }
  .timeline-item { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid #f8f9fa; font-size: 11px; }
  .timeline-time { color: #888; font-family: monospace; min-width: 70px; }
  .timeline-type { min-width: 90px; font-weight: 600; }
  .timeline-desc { color: #444; flex: 1; }
  .timeline-item.error { background: #fef2f2; }
  .timeline-item.error .timeline-type { color: #dc2626; }
  .annotation { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px; margin: 6px 0; }
  .annotation-severity { font-size: 9px; font-weight: 700; text-transform: uppercase; }
  .screenshot-list { margin: 8px 0; }
  .screenshot-item { margin: 12px 0; }
  .screenshot-item img { max-width: 100%; border: 1px solid #e0e0e0; border-radius: 6px; }
  .screenshot-label { font-size: 10px; color: #888; margin-top: 4px; }
  .footer { text-align: center; color: #888; font-size: 10px; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e0e0e0; }
  .print-btn { display: block; margin: 16px auto; padding: 10px 24px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
  .print-btn:hover { background: #2563eb; }
</style></head><body>`;

  // Print button (hidden in print)
  html += `<button class="print-btn no-print" onclick="window.print()">Save as PDF</button>\n`;

  // Header
  html += `<h1>TraceBug Bug Report</h1>\n`;
  html += `<div class="meta">${escapeHtml(report.title)} · ${new Date(report.generatedAt).toLocaleString()}</div>\n`;

  // Environment
  html += `<h2>Environment</h2>\n`;
  html += `<div class="env-grid">
    <div class="env-item"><div class="env-label">Browser</div><div class="env-value">${escapeHtml(env.browser)} ${escapeHtml(env.browserVersion)}</div></div>
    <div class="env-item"><div class="env-label">OS</div><div class="env-value">${escapeHtml(env.os)}</div></div>
    <div class="env-item"><div class="env-label">Viewport</div><div class="env-value">${escapeHtml(env.viewport)}</div></div>
    <div class="env-item"><div class="env-label">Device</div><div class="env-value">${env.deviceType}</div></div>
    <div class="env-item"><div class="env-label">Connection</div><div class="env-value">${escapeHtml(env.connectionType)}</div></div>
    <div class="env-item"><div class="env-label">URL</div><div class="env-value" style="word-break:break-all;font-size:10px">${escapeHtml(env.url)}</div></div>
  </div>\n`;

  // Steps to Reproduce
  html += `<h2>Steps to Reproduce</h2>\n`;
  if (report.steps) {
    html += `<div class="steps"><pre>${escapeHtml(report.steps)}</pre></div>\n`;
  } else {
    html += `<p style="color:#888">No steps recorded</p>\n`;
  }

  // Annotations
  if (report.annotations.length > 0) {
    html += `<h2>Tester Notes</h2>\n`;
    for (const note of report.annotations) {
      const severityColor = note.severity === "critical" ? "#dc2626" : note.severity === "major" ? "#d97706" : note.severity === "minor" ? "#2563eb" : "#666";
      html += `<div class="annotation">
        <span class="annotation-severity" style="color:${severityColor}">${note.severity}</span>
        <div style="margin-top:4px">${escapeHtml(note.text)}</div>
        ${note.expected ? `<div style="margin-top:4px"><strong>Expected:</strong> ${escapeHtml(note.expected)}</div>` : ""}
        ${note.actual ? `<div style="margin-top:2px"><strong>Actual:</strong> ${escapeHtml(note.actual)}</div>` : ""}
      </div>\n`;
    }
  }

  // Voice Description
  if (report.voiceTranscripts && report.voiceTranscripts.length > 0) {
    html += `<h2>Bug Description (Voice)</h2>\n`;
    for (const vt of report.voiceTranscripts) {
      html += `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin:8px 0;font-style:italic;color:#92400e">
        <span style="font-size:16px;margin-right:6px">🎤</span> ${escapeHtml(vt.text)}
      </div>\n`;
    }
  }

  // Console Errors
  if (report.consoleErrors.length > 0) {
    html += `<h2>Console Errors <span class="badge badge-error">${report.consoleErrors.length}</span></h2>\n`;
    for (const err of report.consoleErrors) {
      html += `<div class="error-box">
        <div class="error-msg">${escapeHtml(err.message)}</div>
        ${err.stack ? `<div class="stack">${escapeHtml(err.stack)}</div>` : ""}
      </div>\n`;
    }
  }

  // Network Errors
  if (report.networkErrors.length > 0) {
    html += `<h2>Failed Network Requests <span class="badge badge-error">${report.networkErrors.length}</span></h2>\n`;
    html += `<table class="network-table">
      <thead><tr><th>Method</th><th>URL</th><th>Status</th><th>Duration</th></tr></thead>
      <tbody>\n`;
    for (const req of report.networkErrors) {
      const status = req.status === 0 ? "Network Error" : String(req.status);
      html += `<tr class="error"><td>${req.method}</td><td style="word-break:break-all">${escapeHtml(req.url.slice(0, 80))}</td><td>${status}</td><td>${req.duration}ms</td></tr>\n`;
    }
    html += `</tbody></table>\n`;
  }

  // Screenshots
  if (report.screenshots.length > 0) {
    html += `<h2>Screenshots</h2>\n<div class="screenshot-list">\n`;
    for (const ss of report.screenshots) {
      html += `<div class="screenshot-item">
        <div class="screenshot-label">${escapeHtml(ss.filename)} — ${escapeHtml(ss.eventContext)}</div>
        <img src="${ss.dataUrl}" alt="${escapeHtml(ss.filename)}" />
      </div>\n`;
    }
    html += `</div>\n`;
  }

  // Timeline
  if (report.timeline.length > 0) {
    html += `<h2>Session Timeline (${report.timeline.length} events)</h2>\n<div class="timeline">\n`;
    for (const entry of report.timeline) {
      const errClass = entry.isError ? " error" : "";
      html += `<div class="timeline-item${errClass}">
        <span class="timeline-time">${escapeHtml(entry.elapsed)}</span>
        <span class="timeline-type">${escapeHtml(entry.type)}</span>
        <span class="timeline-desc">${escapeHtml(entry.description)}</span>
      </div>\n`;
    }
    html += `</div>\n`;
  }

  // Footer
  html += `<div class="footer">Generated by TraceBug SDK · Session: ${session.sessionId.slice(0, 8)} · ${new Date(report.generatedAt).toLocaleString()}</div>\n`;
  html += `</body></html>`;

  return html;
}

function downloadAsHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
