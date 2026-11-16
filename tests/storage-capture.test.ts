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

  it('redacts values under user-declared redact fields', async () => {
    const { setRedactRules } = await import('../src/sanitize/custom-redaction');
    setRedactRules({ fields: ['customer'] });
    try {
      localStorage.setItem('customer_email', 'jane@acme.com');
      const snap = captureStorageSnapshot();
      const e = snap.local.find((x) => x.key === 'customer_email')!;
      expect(e.redacted).toBe(true);
      expect(e.value).not.toContain('jane@acme.com');
    } finally {
      setRedactRules(undefined);
    }
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

describe('personal data inside harmless-looking keys', () => {
  it('masks personal and secret fields inside JSON values (analytics visitor blobs)', () => {
    localStorage.setItem('analyticsConfig', JSON.stringify({
      key: '1_17849_17851',
      value: { visitor: { id: 5633785, email: 'jane.doe@example.com', first_name: 'Jane', last_name: 'Doe',
        timezone: 'America/New_York', newsletter: false, sessionId: 'abc123def456' } },
    }));
    const e = captureStorageSnapshot().local.find((x) => x.key === 'analyticsConfig')!;
    expect(e.redacted).toBe(true);
    expect(e.value).not.toContain('jane.doe@example.com');
    expect(e.value).not.toContain('"Jane"');
    expect(e.value).not.toContain('"Doe"');
    expect(e.value).not.toContain('abc123def456');
    // What helps debugging survives: ids, flags, settings.
    expect(e.value).toContain('5633785');
    expect(e.value).toContain('America/New_York');
    expect(e.value).toContain('"newsletter":false');
  });

  it('masks emails in plain text values, keeping a recognisable shape', () => {
    localStorage.setItem('lastContact', 'sent to jane.doe@example.com on Monday');
    const e = captureStorageSnapshot().local.find((x) => x.key === 'lastContact')!;
    expect(e.redacted).toBe(true);
    expect(e.value).toBe('sent to j***@e***.com on Monday');
  });

  it('masks token shapes embedded in a value', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    sessionStorage.setItem('cache', JSON.stringify({ items: 3, note: `jwt ${jwt}` }));
    const e = captureStorageSnapshot().session.find((x) => x.key === 'cache')!;
    expect(e.redacted).toBe(true);
    expect(e.value).not.toContain(jwt);
    expect(e.value).toContain('"items":3');
  });

  it('leaves ordinary values untouched and unmarked', () => {
    localStorage.setItem('prefs', '{ "theme": "light", "accessible": true, "sort": "most-used" }');
    localStorage.setItem('calendarId', '"primary"');
    const snap = captureStorageSnapshot();
    const prefs = snap.local.find((x) => x.key === 'prefs')!;
    expect(prefs.redacted).toBeUndefined();
    expect(prefs.value).toBe('{ "theme": "light", "accessible": true, "sort": "most-used" }');
    expect(snap.local.find((x) => x.key === 'calendarId')?.redacted).toBeUndefined();
  });

  it('scrubs before capping, so a cut never keeps half an email', () => {
    localStorage.setItem('log', 'x'.repeat(290) + ' jane.doe@example.com');
    const e = captureStorageSnapshot().local.find((x) => x.key === 'log')!;
    expect(e.value).not.toContain('jane.do');
  });
});
