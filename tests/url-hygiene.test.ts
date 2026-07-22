import { describe, it, expect } from 'vitest';
import { isNoiseRequest, isStaticResource, shortDisplayPath, isSensitiveParamName } from '../src/url-hygiene';

// The real-world case that motivated this module: a failed shields.io badge
// behind GitHub's camo proxy was reported as "API Failure (high confidence)"
// with a ~500-char hex path as the bug title.
const CAMO_URL =
  'https://camo.githubusercontent.com/7201bf24b202a60bfb5d8e83c47b2fe353cc8a693cfc106b0b02a0d9763042f0/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f';

describe('isSensitiveParamName (unified capture + upload matcher)', () => {
  it('catches the names the capture-path regex historically covered', () => {
    for (const k of ['token', 'access_token', 'api_key', 'x-api-key', 'secret', 'authorization', 'password', 'sig', 'signature']) {
      expect(isSensitiveParamName(k)).toBe(true);
    }
  });

  it('catches the names only the upload Set covered (the drift the merge closes)', () => {
    // These previously slipped through the capture-time redactor.
    for (const k of ['session', 'sid', 'csrf', 'passwd', 'pwd']) {
      expect(isSensitiveParamName(k)).toBe(true);
    }
  });

  it('catches sig/signature that the upload Set missed (AWS presigned URLs)', () => {
    expect(isSensitiveParamName('X-Amz-Signature')).toBe(true);
    expect(isSensitiveParamName('sig')).toBe(true);
  });

  it('leaves ordinary params alone', () => {
    for (const k of ['q', 'page', 'limit', 'lang', 'id', 'name']) {
      expect(isSensitiveParamName(k)).toBe(false);
    }
    expect(isSensitiveParamName(undefined)).toBe(false);
  });
});

describe('isNoiseRequest', () => {
  it('flags GitHub camo image-proxy URLs as noise', () => {
    expect(isNoiseRequest(CAMO_URL)).toBe(true);
  });

  it('flags badge/font/analytics hosts as noise', () => {
    expect(isNoiseRequest('https://img.shields.io/badge/npm-1.7.0-blue')).toBe(true);
    expect(isNoiseRequest('https://fonts.gstatic.com/s/geist/v1/x.woff2')).toBe(true);
    expect(isNoiseRequest('https://www.google-analytics.com/collect?v=1')).toBe(true);
  });

  it('flags static-asset extensions as noise regardless of host', () => {
    expect(isNoiseRequest('/images/logo.png')).toBe(true);
    expect(isNoiseRequest('https://myapp.com/hero.webp?v=2')).toBe(true);
    expect(isNoiseRequest('/styles/main.css')).toBe(true);
  });

  it('does NOT flag application API calls', () => {
    expect(isNoiseRequest('/api/orders')).toBe(false);
    expect(isNoiseRequest('https://myapp.com/api/v2/users?page=1')).toBe(false);
    expect(isNoiseRequest('https://api.stripe.com/v1/charges')).toBe(false);
  });

  it('handles empty/undefined without throwing', () => {
    expect(isNoiseRequest(undefined)).toBe(false);
    expect(isNoiseRequest('')).toBe(false);
  });
});

describe('shortDisplayPath', () => {
  it('middle-ellipsizes hash-like segments so titles cannot flood', () => {
    const out = shortDisplayPath(CAMO_URL);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out).toContain('…');
    expect(out).toContain('7201bf24b2'); // start of the segment survives
  });

  it('leaves normal API paths untouched', () => {
    expect(shortDisplayPath('https://myapp.com/api/orders')).toBe('/api/orders');
    expect(shortDisplayPath('/api/v2/users')).toBe('/api/v2/users');
  });

  it('caps overall length at 60 chars', () => {
    const long = '/a/' + Array.from({ length: 20 }, (_, i) => `seg${i}`).join('/');
    expect(shortDisplayPath(long).length).toBeLessThanOrEqual(60);
  });

  it('survives unparseable input with a capped raw fallback', () => {
    expect(shortDisplayPath('')).toBe('');
    expect(shortDisplayPath(undefined)).toBe('');
  });
});

describe('isNoiseRequest — telemetry beacons (GitHub collector regression)', () => {
  it('flags collector/stats/telemetry subdomains on any domain', () => {
    expect(isNoiseRequest('https://collector.github.com/github/collect')).toBe(true);
    expect(isNoiseRequest('https://stats.wp.com/g.gif')).toBe(true);
    expect(isNoiseRequest('https://telemetry.example.com/v1/events')).toBe(true);
  });

  it('flags beacon-shaped third-party paths (/collect, /_private/)', () => {
    expect(isNoiseRequest('https://api.github.com/_private/browser/stats')).toBe(true);
    expect(isNoiseRequest('https://thirdparty.example.com/collect')).toBe(true);
  });

  it('does NOT flag an app\'s own relative analytics-ish routes', () => {
    expect(isNoiseRequest('/api/analytics')).toBe(false);
    expect(isNoiseRequest('/api/tracking/orders')).toBe(false);
  });

  it('does NOT flag ordinary third-party APIs', () => {
    expect(isNoiseRequest('https://api.stripe.com/v1/charges')).toBe(false);
  });
});

describe('isStaticResource', () => {
  it('includes scripts and styles (unlike isNoiseRequest)', () => {
    expect(isStaticResource('https://github.githubassets.com/assets/43223-d8967b.js')).toBe(true);
    expect(isStaticResource('/styles/main.css')).toBe(true);
    expect(isStaticResource('/chunk-89194.js?v=2')).toBe(true);
  });

  it('excludes API endpoints', () => {
    expect(isStaticResource('/api/orders')).toBe(false);
    expect(isStaticResource('https://api.github.com/repos')).toBe(false);
  });
});
