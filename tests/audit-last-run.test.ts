import { describe, it, expect, beforeEach } from 'vitest';
import { auditPageKey, clearSavedAuditRuns, loadAuditRun, saveAuditRun } from '../src/audit/last-run';
import type { AuditRun } from '../src/types';

// Last audit per page (src/audit/last-run.ts): sessionStorage, never localStorage.

const run = (url: string, scan: string, overall = 50, extra = ''): AuditRun => ({
  url, scan, scannedAt: Date.now(), viewport: { width: 1, height: 1 }, categories: [],
  findings: [], truncated: 0, score: { overall, categories: {} }, note: extra,
} as unknown as AuditRun);

describe('saved audit runs', () => {
  beforeEach(() => { clearSavedAuditRuns(); localStorage.clear(); });

  it('ignores the hash, keeps the query, stores no query value', () => {
    expect(auditPageKey('https://a.dev/x?q=1#top')).toBe(auditPageKey('https://a.dev/x?q=1'));
    expect(auditPageKey('https://a.dev/x?q=1')).not.toBe(auditPageKey('https://a.dev/x?q=2'));
    expect(auditPageKey('https://a.dev/x?token=SECRET')).not.toContain('SECRET');
  });

  it('returns the newest run per page and scan', () => {
    saveAuditRun(run('https://a.dev/x', 'full', 40), 'https://a.dev/x');
    saveAuditRun(run('https://a.dev/x', 'accessibility', 70), 'https://a.dev/x');
    saveAuditRun(run('https://a.dev/x#h', 'full', 60), 'https://a.dev/x#h');
    expect(loadAuditRun('https://a.dev/x', 'full')?.score?.overall).toBe(60);
    expect(loadAuditRun('https://a.dev/x', 'accessibility')?.score?.overall).toBe(70);
    expect(loadAuditRun('https://a.dev/x')?.score?.overall).toBe(60);
    expect(loadAuditRun('https://a.dev/other', 'full')).toBeNull();
  });

  it('keeps only the last few entries', () => {
    for (let i = 0; i < 12; i++) saveAuditRun(run(`https://a.dev/p${i}`, 'full', i), `https://a.dev/p${i}`);
    expect(loadAuditRun('https://a.dev/p11', 'full')?.score?.overall).toBe(11);
    expect(loadAuditRun('https://a.dev/p0', 'full')).toBeNull();
  });

  it('skips a run too big to keep, and never touches localStorage', () => {
    saveAuditRun(run('https://a.dev/big', 'full', 1, 'x'.repeat(1_600_000)), 'https://a.dev/big');
    expect(loadAuditRun('https://a.dev/big', 'full')).toBeNull();
    saveAuditRun(run('https://a.dev/x', 'full'), 'https://a.dev/x');
    expect(localStorage.length).toBe(0);
  });

  it('survives corrupt storage', () => {
    sessionStorage.setItem('tracebug_audit_last_v1', '{not json');
    expect(loadAuditRun('https://a.dev/x', 'full')).toBeNull();
    saveAuditRun(run('https://a.dev/x', 'full', 9), 'https://a.dev/x');
    expect(loadAuditRun('https://a.dev/x', 'full')?.score?.overall).toBe(9);
  });
});
