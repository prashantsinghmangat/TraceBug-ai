import { describe, it, expect } from 'vitest';
import { collectConsoleWarnings, collectConsoleInfo, collectConsoleLogs, formatConsoleArgs, capMessage, CONSOLE_MSG_MAX } from '../src/collectors';
import type { EventType } from '../src/types';

type Emitted = { type: EventType; data: Record<string, unknown> };

function capture(collect: (emit: any) => () => void, method: 'warn' | 'info' | 'log') {
  // Stub the underlying method first so test runs don't spew 60 lines of
  // pass-through output — the wrapper's "ALWAYS call original" hits the stub.
  const real = console[method];
  console[method] = () => {};
  const emitted: Emitted[] = [];
  const inner = collect((type: EventType, data: Record<string, unknown>) => {
    emitted.push({ type, data });
  });
  const cleanup = () => { inner(); console[method] = real; };
  return { emitted, cleanup, call: (...args: unknown[]) => (console[method] as any)(...args) };
}

describe.each([
  ['warn', collectConsoleWarnings, 'console_warn'],
  ['info', collectConsoleInfo, 'console_info'],
  ['log', collectConsoleLogs, 'console_log'],
] as const)('console.%s collector', (method, collect, eventType) => {
  it(`emits ${eventType} with the joined message`, () => {
    const { emitted, cleanup, call } = capture(collect, method);
    try {
      call('cart state', { step: 2 });
    } finally { cleanup(); }
    expect(emitted.length).toBe(1);
    expect(emitted[0].type).toBe(eventType);
    expect((emitted[0].data as any).error.message).toBe('cart state {"step":2}');
  });

  it('skips TraceBug\'s own "[TraceBug]" diagnostics', () => {
    const { emitted, cleanup, call } = capture(collect, method);
    try {
      call('[TraceBug] Session ended: abc');
      call('app message');
    } finally { cleanup(); }
    expect(emitted.length).toBe(1);
    expect((emitted[0].data as any).error.message).toBe('app message');
  });

  it('caps capture at 50 per session but keeps the console working', () => {
    const { emitted, cleanup, call } = capture(collect, method);
    try {
      for (let i = 0; i < 60; i++) call(`m${i}`);
    } finally { cleanup(); }
    expect(emitted.length).toBe(50);
    expect((emitted[0].data as any).error.message).toBe('m0');
    expect((emitted[49].data as any).error.message).toBe('m49');
  });

  it('masks token shapes at capture so the offline export never sees them', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c';
    const { emitted, cleanup, call } = capture(collect, method);
    try {
      call('auth header:', `Bearer ${jwt}`);
    } finally { cleanup(); }
    const msg = (emitted[0].data as any).error.message as string;
    expect(msg).toContain('[REDACTED]');
    expect(msg).not.toContain(jwt);
  });

  it('restores the original console method on cleanup', () => {
    const orig = console[method];
    const { cleanup } = capture(collect, method);
    expect(console[method]).not.toBe(orig);
    cleanup();
    expect(console[method]).toBe(orig);
  });

  it('caps a huge logged object so it cannot bloat the report', () => {
    const huge = { blob: 'x'.repeat(500_000) };
    const { emitted, cleanup, call } = capture(collect, method);
    try { call('payload', huge); } finally { cleanup(); }
    const msg = (emitted[0].data as any).error.message as string;
    expect(msg.length).toBeLessThanOrEqual(CONSOLE_MSG_MAX + 20);
    expect(msg).toContain('…[truncated]');
  });

  it('does not drop the event when a circular object is logged', () => {
    const circular: any = { name: 'node' };
    circular.self = circular;
    const { emitted, cleanup, call } = capture(collect, method);
    try { call('cycle', circular); } finally { cleanup(); }
    // Old bare JSON.stringify threw → outer catch dropped the whole event.
    expect(emitted.length).toBe(1);
    expect((emitted[0].data as any).error.message).toContain('[unserializable]');
  });
});

describe('formatConsoleArgs / capMessage', () => {
  it('joins mixed args and caps the result', () => {
    const out = formatConsoleArgs(['status', 500, { ok: false }]);
    expect(out).toBe('status 500 {"ok":false}');
  });

  it('capMessage appends the marker only past the limit', () => {
    expect(capMessage('short', 10)).toBe('short');
    expect(capMessage('x'.repeat(20), 10)).toBe('x'.repeat(10) + '…[truncated]');
  });

  it('degrades a circular arg without throwing', () => {
    const c: any = {}; c.self = c;
    expect(() => formatConsoleArgs([c])).not.toThrow();
    expect(formatConsoleArgs([c])).toBe('[unserializable]');
  });
});
