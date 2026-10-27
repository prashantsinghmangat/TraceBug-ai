// The Console tab is where error/warning/log text actually renders now (the
// Actions tab dropped error/warning/network chips — they duplicated the
// Console and Network tabs, which was the "lots of other things, not clean"
// complaint). This file used to test that text extraction via
// buildActionChips; it now tests report-builder.ts's extractConsoleMessage,
// the function that moved there with the same job: collectors emit the text
// NESTED as `data.error.message`, and reading `data.message` directly used to
// find nothing — stringifying the `data.error` OBJECT when that came up
// empty, or silently dropping an argument-less console.warn() altogether.
// These tests pin the real emitted shape, so a future collector change that
// moves the message breaks here instead of in the report.
import { describe, it, expect } from 'vitest';
import { extractConsoleMessage } from '../src/report-builder';
import type { TraceBugEvent } from '../src/types';

describe('extractConsoleMessage — error shapes', () => {
  it('shows the nested error message, not [object Object]', () => {
    const data = { error: { message: "Cannot read properties of null (reading 'total')", stack: 'TypeError: …' } } as TraceBugEvent['data'];
    const msg = extractConsoleMessage(data, 'Runtime error');
    expect(msg).toBe("Cannot read properties of null (reading 'total')");
    expect(msg).not.toContain('[object Object]');
  });

  it('falls back to the error NAME when there is no message', () => {
    // `new TypeError()` has an empty message. The name is still information.
    const data = { error: { name: 'TypeError', message: '' } } as TraceBugEvent['data'];
    expect(extractConsoleMessage(data, 'Runtime error')).toBe('TypeError');
  });

  it('never stringifies an object', () => {
    const shapes: TraceBugEvent['data'][] = [
      { error: { message: { nested: 'object' } } } as unknown as TraceBugEvent['data'],
      { error: {} } as TraceBugEvent['data'],
      {} as TraceBugEvent['data'],
      { error: [1, 2, 3] } as unknown as TraceBugEvent['data'],
    ];
    for (const data of shapes) {
      const msg = extractConsoleMessage(data, 'Runtime error');
      expect(msg).toBe('Runtime error');
      expect(msg).not.toContain('[object Object]');
    }
  });

  it('accepts a plain string error, and a top-level message', () => {
    expect(extractConsoleMessage({ error: 'Script error.' } as TraceBugEvent['data'], 'Runtime error')).toBe('Script error.');
    expect(extractConsoleMessage({ message: 'from a future shape' } as unknown as TraceBugEvent['data'], 'Runtime error')).toBe('from a future shape');
  });
});

describe('extractConsoleMessage — warning shapes', () => {
  it("shows the warning text instead of the bare word 'Warning'", () => {
    // This is the exact shape wrapConsoleLevel('warn') emits.
    const data = { error: { message: 'React: validateDOMNesting(<div> in <p>)' } } as TraceBugEvent['data'];
    expect(extractConsoleMessage(data, 'Warning')).toBe('React: validateDOMNesting(<div> in <p>)');
  });

  it("keeps the level fallback only when there is genuinely no text", () => {
    // console.warn() with no arguments — the fallback is all we have, and
    // this entry must NOT be silently dropped (report-builder.ts no longer
    // filters consoleLogs by truthy message).
    const data = { error: { message: '' } } as TraceBugEvent['data'];
    expect(extractConsoleMessage(data, 'Warning')).toBe('Warning');
  });

  it('ignores whitespace-only text', () => {
    const data = { error: { message: '   \n  ' } } as TraceBugEvent['data'];
    expect(extractConsoleMessage(data, 'Warning')).toBe('Warning');
  });
});
