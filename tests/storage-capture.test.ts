import { describe, it, expect, beforeEach } from 'vitest';
import { captureStorageSnapshot } from '../src/storage-capture';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('captureStorageSnapshot', () => {
  it('captures plain values from both storage areas', () => {
    localStorage.setItem('theme', 'dark');
    sessionStorage.setItem('wizardStep', '3');

    const snap = captureStorageSnapshot();

    const theme = snap.local.find((e) => e.key === 'theme');
    expect(theme?.value).toBe('dark');
    expect(theme?.redacted).toBeUndefined();
    expect(snap.session.find((e) => e.key === 'wizardStep')?.value).toBe('3');
  });

  it('redacts values whose key looks sensitive', () => {
    localStorage.setItem('authToken', 'supersecretvalue1234567890');
    localStorage.setItem('user_password', 'hunter2hunter2');

    const snap = captureStorageSnapshot();

    const tok = snap.local.find((e) => e.key === 'authToken')!;
    expect(tok.redacted).toBe(true);
    expect(tok.value).toContain('[REDACTED]');
    expect(tok.value).not.toContain('supersecretvalue');

    const pw = snap.local.find((e) => e.key === 'user_password')!;
    expect(pw.redacted).toBe(true);
    expect(pw.value).not.toContain('hunter2');
  });

  it('redacts token-shaped values even under innocuous keys', () => {
    localStorage.setItem('cache', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdefg');
    localStorage.setItem('blobRef', 'sk-abcdefghijklmnopqrstuvwxyz0123');

    const snap = captureStorageSnapshot();

    expect(snap.local.find((e) => e.key === 'cache')?.redacted).toBe(true);
    expect(snap.local.find((e) => e.key === 'blobRef')?.redacted).toBe(true);
  });

  it('truncates very long non-sensitive values', () => {
    localStorage.setItem('bigBlob', 'x'.repeat(1000));

    const snap = captureStorageSnapshot();
    const e = snap.local.find((x) => x.key === 'bigBlob')!;

    expect(e.redacted).toBeUndefined();
    expect(e.value.length).toBeLessThan(1000);
    expect(e.value.endsWith('…')).toBe(true);
  });

  it('caps entries per area and reports how many were dropped', () => {
    for (let i = 0; i < 60; i++) localStorage.setItem(`item${i}`, `v${i}`);

    const snap = captureStorageSnapshot();

    expect(snap.local.length).toBe(50);
    expect(snap.localTruncated).toBe(10);
  });

  it('returns empty arrays when storage is empty', () => {
    const snap = captureStorageSnapshot();
    expect(snap.local).toEqual([]);
    expect(snap.session).toEqual([]);
    expect(snap.localTruncated).toBeUndefined();
  });
});
