import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveCloudEndpoint, DEFAULT_CLOUD_ENDPOINT } from '../src/cloud-endpoint';

describe('resolveCloudEndpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the default when no endpoint is given', () => {
    expect(resolveCloudEndpoint()).toBe(DEFAULT_CLOUD_ENDPOINT);
    expect(resolveCloudEndpoint(null)).toBe(DEFAULT_CLOUD_ENDPOINT);
    expect(resolveCloudEndpoint('')).toBe(DEFAULT_CLOUD_ENDPOINT);
    expect(resolveCloudEndpoint('   ')).toBe(DEFAULT_CLOUD_ENDPOINT);
  });

  it('accepts HTTPS endpoints and strips trailing slashes', () => {
    expect(resolveCloudEndpoint('https://portal.example.com/')).toBe('https://portal.example.com');
    expect(resolveCloudEndpoint('https://portal.example.com///')).toBe('https://portal.example.com');
  });

  it('preserves subpath deployments', () => {
    expect(resolveCloudEndpoint('https://example.com/tracebug/')).toBe('https://example.com/tracebug');
  });

  it('allows plain http only on localhost', () => {
    expect(resolveCloudEndpoint('http://localhost:3000')).toBe('http://localhost:3000');
    expect(resolveCloudEndpoint('http://127.0.0.1:8888')).toBe('http://127.0.0.1:8888');
  });

  it('rejects plain http on non-localhost hosts', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveCloudEndpoint('http://evil.example.com')).toBe(DEFAULT_CLOUD_ENDPOINT);
  });

  it('rejects non-http(s) protocols', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // eslint-disable-next-line no-script-url
    expect(resolveCloudEndpoint('javascript:alert(1)')).toBe(DEFAULT_CLOUD_ENDPOINT);
    expect(resolveCloudEndpoint('data:text/html,hi')).toBe(DEFAULT_CLOUD_ENDPOINT);
    expect(resolveCloudEndpoint('file:///etc/passwd')).toBe(DEFAULT_CLOUD_ENDPOINT);
  });

  it('rejects malformed URLs', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveCloudEndpoint('not a url')).toBe(DEFAULT_CLOUD_ENDPOINT);
  });
});
