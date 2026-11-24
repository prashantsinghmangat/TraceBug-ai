// Settings → default repository picker (tracker-connect.js fillDefaultPicker).
// B10: Settings re-renders on every storage change, so two fills overlapped and
// each appended the whole list ("Choose a repository…, tracebug-test, Choose a
// repository…, tracebug-test"). Runs the shipped file in jsdom.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension', 'tracker-connect.js'), 'utf8');

type Picker = (t: unknown, select: HTMLSelectElement, say: (m: string, e?: boolean) => void) => Promise<number>;
let fill: Picker;
let answers: Array<() => unknown>;

beforeAll(() => {
  answers = [];
  // Each containers call answers when the test says so, in any order.
  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: (_m: unknown, cb: (r: unknown) => void) => { answers.push(() => cb({ items: [{ id: 'acme/tracebug-test', label: 'acme/tracebug-test' }] })); },
    },
  };
  (0, eval)(src);
  fill = (globalThis as unknown as { TraceBugTrackerConnect: { fillDefaultPicker: Picker } }).TraceBugTrackerConnect.fillDefaultPicker;
});
afterAll(() => { delete (globalThis as Record<string, unknown>).chrome; });

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('default repository picker (B10)', () => {
  const t = { id: 'github', containerNoun: 'Repository', last: { container: 'acme/tracebug-test' } };

  it('two overlapping fills list each option once', async () => {
    const select = document.createElement('select');
    const a = fill(t, select, () => {});
    const b = fill(t, select, () => {});
    await tick();
    answers.splice(0).forEach((go) => go());
    await Promise.all([a, b]);
    expect([...select.options].map((o) => o.textContent)).toEqual(['Choose a repository…', 'acme/tracebug-test']);
    expect(select.value).toBe('acme/tracebug-test');
  });

  it('an older answer arriving last changes nothing', async () => {
    const select = document.createElement('select');
    const a = fill(t, select, () => {});
    const b = fill(t, select, () => {});
    await tick();
    const [first, second] = answers.splice(0);
    second();
    await b;
    first();
    await a;
    expect(select.options).toHaveLength(2);
  });
});
