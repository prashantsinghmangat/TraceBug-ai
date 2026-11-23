// video-cut's Firefox "kept length" flake was a real bug: Firefox can fire an
// empty dataavailable, then "stop", then the LAST chunk. cutVideo built the
// file at "stop" and lost the final second (2.02 s instead of 3 s, seen in
// e2e:video-cut). collectUntilFinal waits for that chunk.
import { describe, it, expect } from 'vitest';
import { collectUntilFinal } from '../src/ui/video-trim';

function fakeRecorder() {
  const rec = {
    ondataavailable: null as ((e: BlobEvent) => void) | null,
    onstop: null as ((e: Event) => void) | null,
    stopped: false,
    stop() { this.stopped = true; },
    data(size: number) { this.ondataavailable!({ data: new Blob([new Uint8Array(size)]) } as BlobEvent); },
  };
  return rec;
}

describe('collectUntilFinal', () => {
  it("Firefox's order — empty chunk, stop, final chunk — keeps the final chunk", async () => {
    const rec = fakeRecorder();
    const chunks: Blob[] = [];
    const done = collectUntilFinal(rec, chunks, 5000);
    rec.data(100); rec.data(100);           // two timeslices
    rec.stop();
    rec.data(0); rec.onstop!(new Event('stop'));             // empty chunk, then stop…
    let finished = false; void done.then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);           // …not done yet
    rec.data(120);                          // the last second arrives after stop
    await done;
    expect(chunks.map((c) => c.size)).toEqual([100, 100, 120]);
  });

  it('the usual order — final chunk, then stop — finishes at stop', async () => {
    const rec = fakeRecorder();
    const chunks: Blob[] = [];
    const done = collectUntilFinal(rec, chunks, 5000);
    rec.data(100); rec.stop(); rec.data(80); rec.onstop!(new Event('stop'));
    await done;
    expect(chunks.map((c) => c.size)).toEqual([100, 80]);
  });

  it('no final data at all — finishes after the grace period', async () => {
    const rec = fakeRecorder();
    const chunks: Blob[] = [];
    const t = Date.now();
    const done = collectUntilFinal(rec, chunks, 30);
    rec.data(100); rec.stop(); rec.onstop!(new Event('stop'));
    await done;
    expect(Date.now() - t).toBeGreaterThanOrEqual(25);
    expect(chunks.length).toBe(1);
  });
});
