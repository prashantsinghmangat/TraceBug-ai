// The Actions tab is the first thing a developer reads in a bug report, and
// two of its rows were showing nothing useful:
//
//   * error / console_error / unhandled_rejection → "[object Object]"
//   * console_warn                                → the bare word "Warning"
//
// Both for the same reason: collectors emit the text NESTED as
// `data.error.message` (src/collectors.ts), and the chip builder was reading
// `data.message`, then stringifying the `data.error` OBJECT when that came up
// empty. These tests pin the real emitted shape, so a future collector change
// that moves the message breaks here instead of in the report.
import { describe, it, expect } from 'vitest';
import { buildActionChips } from '../src/action-chips';
import type { TraceBugEvent } from '../src/types';

let _n = 0;
function ev(type: string, data: unknown): TraceBugEvent {
  return {
    id: `e${++_n}`,
    sessionId: 's1',
    projectId: 'p1',
    type: type as TraceBugEvent['type'],
    page: '/checkout',
    timestamp: 1000 + _n,
    data: data as TraceBugEvent['data'],
  };
}

/** Exactly what collectors.ts emits for window.onerror. */
const windowError = () =>
  ev('error', {
    error: {
      message: "Cannot read properties of null (reading 'total')",
      stack: 'TypeError: Cannot read…\n  at cart.js:42',
      source: 'cart.js',
      line: 42,
    },
  });

describe('error chips', () => {
  it('shows the nested error message, not [object Object]', () => {
    const [chip] = buildActionChips([windowError()]);
    expect(chip.verb).toBe('Error');
    expect(chip.detail).toBe("Cannot read properties of null (reading 'total')");
    expect(chip.detail).not.toContain('[object Object]');
    expect(chip.isError).toBe(true);
  });

  it('covers console_error and unhandled_rejection too', () => {
    const chips = buildActionChips([
      ev('console_error', { error: { message: 'Payment failed: 502' } }),
      ev('unhandled_rejection', { error: { message: 'fetch aborted' } }),
    ]);
    expect(chips.map((c) => c.detail)).toEqual(['Payment failed: 502', 'fetch aborted']);
  });

  it('falls back to the error NAME when there is no message', () => {
    // `new TypeError()` has an empty message. The name is still information.
    const [chip] = buildActionChips([ev('error', { error: { name: 'TypeError', message: '' } })]);
    expect(chip.detail).toBe('TypeError');
  });

  it('never stringifies an object', () => {
    // Anything that is not a usable string must reach the fallback wording.
    const chips = buildActionChips([
      ev('error', { error: { message: { nested: 'object' } } }),
      ev('error', { error: {} }),
      ev('error', {}),
      ev('error', { error: [1, 2, 3] }),
    ]);
    for (const chip of chips) {
      expect(chip.detail).toBe('Runtime error');
      expect(chip.detail).not.toContain('[object Object]');
    }
  });

  it('accepts a plain string error, and a top-level message', () => {
    const chips = buildActionChips([
      ev('error', { error: 'Script error.' }),
      ev('console_error', { message: 'from a future shape' }),
    ]);
    expect(chips.map((c) => c.detail)).toEqual(['Script error.', 'from a future shape']);
  });

  it('truncates a long message rather than dropping it', () => {
    const long = 'x'.repeat(500);
    const [chip] = buildActionChips([ev('error', { error: { message: long } })]);
    expect(chip.detail.length).toBeLessThan(100);
    expect(chip.detail.startsWith('xxxx')).toBe(true);
  });
});

describe('warning chips', () => {
  it("shows the warning text instead of the bare word 'Warning'", () => {
    // This is the exact shape wrapConsoleLevel('warn') emits.
    const [chip] = buildActionChips([
      ev('console_warn', { error: { message: 'React: validateDOMNesting(<div> in <p>)' } }),
    ]);
    expect(chip.verb).toBe('Warning');
    expect(chip.detail).toBe('React: validateDOMNesting(<div> in <p>)');
    expect(chip.detail).not.toBe('Warning');
  });

  it('is not marked as an error', () => {
    const [chip] = buildActionChips([ev('console_warn', { error: { message: 'deprecated API' } })]);
    expect(chip.isError).toBeFalsy();
  });

  it("keeps 'Warning' only when there is genuinely no text", () => {
    // console.warn() with no arguments — the word is all we have.
    const [chip] = buildActionChips([ev('console_warn', { error: { message: '' } })]);
    expect(chip.detail).toBe('Warning');
  });

  it('ignores whitespace-only text', () => {
    const [chip] = buildActionChips([ev('console_warn', { error: { message: '   \n  ' } })]);
    expect(chip.detail).toBe('Warning');
  });
});
