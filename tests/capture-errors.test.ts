// Phase 4: a browser blocked by the OS must not look like a user who changed
// their mind.
//
// getDisplayMedia reports both as NotAllowedError. Only the message separates
// them, and the consequence of getting it wrong is specific: on macOS, a
// browser missing from System Settings → Privacy & Security → Screen Recording
// produced "Recording cancelled" and nothing else, so there was no way for the
// user to learn that the fix was in System Settings.
//
// The detection exists twice — src/capture-errors.ts for the SDK, and a local
// copy in tracebug-extension/offscreen.js, which runs the extension's capture
// and cannot import SDK modules. The last block here runs the REAL offscreen.js
// copy in a node:vm sandbox against the same cases, so the two cannot drift
// apart silently.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isSystemPermissionDenial, explainCaptureFailure } from '../src/capture-errors';

/** A DOMException-shaped error, the way a browser hands it over. */
const err = (name: string, message: string) => ({ name, message });

// Real strings, not invented ones.
const CHROME_SYSTEM_DENIAL = err('NotAllowedError', 'Permission denied by system');
const CHROME_USER_CANCEL = err('NotAllowedError', 'Permission denied');
const CHROME_ABORT = err('AbortError', 'Starting video failed');

describe('isSystemPermissionDenial', () => {
  it('recognises Chrome\'s OS-level refusal', () => {
    expect(isSystemPermissionDenial(CHROME_SYSTEM_DENIAL)).toBe(true);
  });

  it('does NOT claim a plain user cancel is a system block', () => {
    // The whole point. These two differ only in the message, and treating a
    // cancel as a system block would send everyone to System Settings for
    // nothing.
    expect(isSystemPermissionDenial(CHROME_USER_CANCEL)).toBe(false);
  });

  it('ignores an abort', () => {
    expect(isSystemPermissionDenial(CHROME_ABORT)).toBe(false);
  });

  it('recognises a NotFoundError with no capture source', () => {
    // A browser denied at the OS level can report "nothing to capture" rather
    // than a refusal.
    expect(isSystemPermissionDenial(err('NotFoundError', 'Screen Recording permission is required'))).toBe(true);
  });

  it('does not fire on an unrelated NotFoundError', () => {
    expect(isSystemPermissionDenial(err('NotFoundError', 'Requested device not found'))).toBe(false);
  });

  it('accepts a bare string, because the RPC boundary loses the DOMException', () => {
    // The extension transport passes error TEXT from the offscreen document to
    // the page; a DOMException cannot be structured-cloned.
    expect(isSystemPermissionDenial('Permission denied by system')).toBe(true);
    expect(isSystemPermissionDenial('Permission denied')).toBe(false);
  });

  it('is safe on nothing', () => {
    expect(isSystemPermissionDenial(null)).toBe(false);
    expect(isSystemPermissionDenial(undefined)).toBe(false);
    expect(isSystemPermissionDenial({})).toBe(false);
  });
});

describe('explainCaptureFailure', () => {
  it('says nothing for a cancel', () => {
    // A user who closed the picker does not need to be told they closed it.
    expect(explainCaptureFailure('cancelled')).toBeNull();
  });

  it('names the exact setting, and the restart', () => {
    const msg = explainCaptureFailure('system-permission')!;
    expect(msg).toContain('System Settings');
    expect(msg).toContain('Screen Recording');
    // The step people skip, and then conclude the extension is broken.
    expect(msg).toMatch(/restart|reopen/i);
    // And the way out that now exists.
    expect(msg).toMatch(/without video/i);
  });

  it('maps an unsupported browser to the same fallback', () => {
    expect(explainCaptureFailure('unsupported')).toMatch(/without video/i);
  });

  it('passes an unrecognised message through rather than inventing one', () => {
    expect(explainCaptureFailure('MediaRecorder could not be created.')).toBe('MediaRecorder could not be created.');
  });
});

describe('offscreen.js carries the same rule', () => {
  // Load the REAL extension file and pull its local copy out of the sandbox.
  // offscreen.js touches `location` and `document` at module scope, so the
  // context needs enough of a browser to get through evaluation.
  const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');
  const sandbox: Record<string, unknown> = {
    location: { search: '' },
    document: { getElementById: () => null, querySelector: () => null },
    navigator: {},
    chrome: { runtime: { onMessage: { addListener: () => {} } } },
    URLSearchParams,
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    setTimeout,
    clearTimeout,
  };
  const ctx = createContext(sandbox);
  runInContext(readFileSync(join(extDir, 'offscreen.js'), 'utf8'), ctx);
  const theirs = runInContext('isSystemPermissionDenial', ctx) as (e: unknown) => boolean;

  it('is actually there', () => {
    expect(typeof theirs).toBe('function');
  });

  it.each([
    ['chrome system denial', CHROME_SYSTEM_DENIAL],
    ['chrome user cancel', CHROME_USER_CANCEL],
    ['abort', CHROME_ABORT],
    ['notfound + screen recording', err('NotFoundError', 'Screen Recording permission is required')],
    ['notfound unrelated', err('NotFoundError', 'Requested device not found')],
    ['nothing', null],
  ])('agrees with the SDK on %s', (_label, input) => {
    expect(theirs(input)).toBe(isSystemPermissionDenial(input));
  });
});
