import { describe, it, expect } from 'vitest';
import { collectConsoleWarnings, collectConsoleInfo, collectConsoleLogs } from '../src/collectors';
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

  it('restores the original console method on cleanup', () => {
    const orig = console[method];
    const { cleanup } = capture(collect, method);
    expect(console[method]).not.toBe(orig);
    cleanup();
    expect(console[method]).toBe(orig);
  });
});
