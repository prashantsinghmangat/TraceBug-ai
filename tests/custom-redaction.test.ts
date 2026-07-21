import { describe, it, expect, afterEach } from 'vitest';
import { setRedactRules, isCustomSensitiveKey, applyCustomRedaction } from '../src/sanitize/custom-redaction';
import { sanitizeTokenShapes } from '../src/sanitize/cloud-upload';

afterEach(() => setRedactRules(undefined));

describe('isCustomSensitiveKey', () => {
  it('matches declared fields case-insensitively as substrings', () => {
    setRedactRules({ fields: ['email'] });
    expect(isCustomSensitiveKey('email')).toBe(true);
    expect(isCustomSensitiveKey('customer_email')).toBe(true);
    expect(isCustomSensitiveKey('EmailAddress')).toBe(true);
    expect(isCustomSensitiveKey('username')).toBe(false);
  });

  it('returns false with no rules installed', () => {
    expect(isCustomSensitiveKey('email')).toBe(false);
  });

  it('clears when rules are reset', () => {
    setRedactRules({ fields: ['email'] });
    setRedactRules(undefined);
    expect(isCustomSensitiveKey('email')).toBe(false);
  });

  it('escapes regex metacharacters in field names', () => {
    setRedactRules({ fields: ['user.id'] });
    expect(isCustomSensitiveKey('user.id')).toBe(true);
    expect(isCustomSensitiveKey('userxid')).toBe(false);
  });
});

describe('applyCustomRedaction — field values in text', () => {
  it('masks JSON string values under declared keys', () => {
    setRedactRules({ fields: ['email'] });
    const out = applyCustomRedaction('{"customer_email": "jane@acme.com", "plan": "pro"}');
    expect(out).toContain('"[REDACTED]"');
    expect(out).not.toContain('jane@acme.com');
    expect(out).toContain('"plan": "pro"');
  });

  it('masks JSON number values under declared keys', () => {
    setRedactRules({ fields: ['account_no'] });
    const out = applyCustomRedaction('{"account_no": 9876543210}');
    expect(out).not.toContain('9876543210');
    expect(out).toContain('[REDACTED]');
  });

  it('masks urlencoded values under declared keys', () => {
    setRedactRules({ fields: ['phone'] });
    const out = applyCustomRedaction('user=1&phone=%2B15551234567&plan=pro');
    expect(out).toContain('phone=[REDACTED]');
    expect(out).toContain('plan=pro');
  });

  it('masks custom string patterns case-insensitively', () => {
    setRedactRules({ patterns: ['\\b\\d{3}-\\d{2}-\\d{4}\\b'] });
    const out = applyCustomRedaction('ssn on file: 123-45-6789 ok');
    expect(out).toBe('ssn on file: [REDACTED] ok');
  });

  it('masks every occurrence of a RegExp pattern (adds the g flag)', () => {
    setRedactRules({ patterns: [/ACCT-\d+/] });
    const out = applyCustomRedaction('ACCT-111 then ACCT-222');
    expect(out).toBe('[REDACTED] then [REDACTED]');
  });

  it('skips invalid pattern strings without throwing', () => {
    setRedactRules({ patterns: ['[unclosed', '\\d{4}'] });
    expect(applyCustomRedaction('pin 1234')).toBe('pin [REDACTED]');
  });

  it('is a no-op with no rules', () => {
    const s = '{"email": "a@b.c"}';
    expect(applyCustomRedaction(s)).toBe(s);
  });
});

describe('integration — custom rules ride the token-shape pipe', () => {
  it('sanitizeTokenShapes applies declared fields (console/network path)', () => {
    setRedactRules({ fields: ['email'] });
    const out = sanitizeTokenShapes('response: {"email": "jane@acme.com"}');
    expect(out).not.toContain('jane@acme.com');
    expect(out).toContain('[REDACTED]');
  });

  it('built-in token masking still runs alongside custom rules', () => {
    setRedactRules({ fields: ['email'] });
    const out = sanitizeTokenShapes('Bearer abcdefghijklmnop123456 for {"email":"a@b.c"}');
    expect(out).toContain('Bearer [REDACTED]');
    expect(out).not.toContain('a@b.c');
  });
});
