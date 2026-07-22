import { describe, it, expect } from 'vitest';
import { trimEventBuffer, type RrwebEvent } from '../src/rrweb-recorder';

const FULL = 2, INCR = 3, META = 4;
const ev = (type: number, i: number): RrwebEvent => ({ type, timestamp: i, data: {} });

// Build: [meta, full, N incrementals, full, M incrementals]
function stream(before: number, after: number): RrwebEvent[] {
  const out: RrwebEvent[] = [ev(META, 0), ev(FULL, 1)];
  for (let i = 0; i < before; i++) out.push(ev(INCR, 100 + i));
  out.push(ev(FULL, 5000)); // second checkpoint
  for (let i = 0; i < after; i++) out.push(ev(INCR, 6000 + i));
  return out;
}

describe('trimEventBuffer', () => {
  it('is a no-op below the soft cap', () => {
    const e = stream(3, 3);
    const before = e.length;
    expect(trimEventBuffer(e, 100, 200)).toBe(false);
    expect(e.length).toBe(before);
  });

  it('drops the segment before the most recent full snapshot', () => {
    // soft cap 10 → over it; keep from the 2nd full snapshot onward
    const e = stream(20, 5); // length = 2 + 20 + 1 + 5 = 28
    expect(trimEventBuffer(e, 10, 1000)).toBe(true);
    // First retained event must be a full snapshot (self-contained replay).
    expect((e[0] as any).type).toBe(FULL);
    // The retained tail is the 2nd checkpoint + its 5 incrementals.
    expect(e.length).toBe(6);
  });

  it('never drops the full snapshot — replay stays valid', () => {
    const e = stream(50, 10);
    trimEventBuffer(e, 15, 1000);
    expect(e.some((x) => (x as any).type === FULL)).toBe(true);
    expect((e[0] as any).type).toBe(FULL);
  });

  it('enforces the hard ceiling even within one huge checkpoint interval', () => {
    // One full snapshot then a massive incremental burst, no second checkpoint.
    const e: RrwebEvent[] = [ev(META, 0), ev(FULL, 1)];
    for (let i = 0; i < 500; i++) e.push(ev(INCR, 10 + i));
    expect(trimEventBuffer(e, 100, 200)).toBe(true);
    expect(e.length).toBeLessThanOrEqual(200);
  });

  it('handles a buffer with no full snapshot without throwing', () => {
    const e: RrwebEvent[] = [];
    for (let i = 0; i < 300; i++) e.push(ev(INCR, i));
    expect(() => trimEventBuffer(e, 100, 200)).not.toThrow();
    expect(e.length).toBeLessThanOrEqual(200);
  });
});
