// The Create panel's field picks (tracebug-extension/panel-fields.js), run as
// shipped in a vm sandbox. B6: when the panel opened prefilled with remembered
// labels, the labels sent differed from the ones shown (#3: six shown, only
// "accessibility" sent; #4: "bug" shown, "duplicate" sent). The chips are now
// drawn from one state and Create sends that same state.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sandbox: Record<string, unknown> = {};
runInContext(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension', 'panel-fields.js'), 'utf8'), createContext(sandbox));

type Picks = Record<string, string[] | string>;
interface Spec { key: string; label: string; kind: 'multi' | 'single'; options: { id: string; label: string }[] }
const PF = sandbox.TraceBugPanelFields as {
  initialPicks: (specs: Spec[], remembered: Record<string, unknown> | null) => Picks;
  toggle: (p: Picks, key: string, id: string) => boolean;
  isPicked: (p: Picks, key: string, id: string) => boolean;
  choiceFields: (specs: Spec[], p: Picks) => Record<string, unknown>;
};

const NAMES = ['accessibility', 'bug', 'documentation', 'duplicate', 'enhancement', 'good first issue', 'help wanted', 'invalid', 'question', 'wontfix'];
const SPECS: Spec[] = [
  { key: 'labels', label: 'Labels', kind: 'multi', options: NAMES.map((n) => ({ id: n, label: n })) },
  { key: 'assignee', label: 'Assignee', kind: 'single', options: [{ id: 'octo', label: 'octo' }, { id: 'ana', label: 'ana' }] },
];
/** What the chips show: every option the state says is picked. */
const shown = (p: Picks) => NAMES.filter((n) => PF.isPicked(p, 'labels', n));
// vm objects have another realm's Array prototype: compare as plain JSON.
const plain = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('Create panel field picks (B6: prefilled → sent)', () => {
  it('six remembered labels: shown and sent are the same six', () => {
    const remembered = { labels: ['accessibility', 'bug', 'documentation', 'duplicate', 'enhancement', 'question'] };
    const p = PF.initialPicks(SPECS, remembered);
    expect(shown(p)).toHaveLength(6);
    expect(plain(PF.choiceFields(SPECS, p).labels)).toEqual(shown(p));
  });

  it('"bug" remembered: "bug" is sent, nothing else', () => {
    const p = PF.initialPicks(SPECS, { labels: ['bug'] });
    expect(shown(p)).toEqual(['bug']);
    expect(plain(PF.choiceFields(SPECS, p))).toEqual({ labels: ['bug'] });
  });

  it('a change after prefill is what goes: untick one, tick another', () => {
    const p = PF.initialPicks(SPECS, { labels: ['bug', 'duplicate'], assignee: 'ana' });
    expect(PF.toggle(p, 'labels', 'duplicate')).toBe(false);
    expect(PF.toggle(p, 'labels', 'question')).toBe(true);
    p.assignee = 'octo';
    expect(plain(PF.choiceFields(SPECS, p))).toEqual({ labels: ['bug', 'question'], assignee: 'octo' });
  });

  it('nothing remembered for this repository → "bug" ticked; an empty memory → nothing', () => {
    expect(plain(PF.choiceFields(SPECS, PF.initialPicks(SPECS, null)))).toEqual({ labels: ['bug'] });
    expect(plain(PF.choiceFields(SPECS, PF.initialPicks(SPECS, { labels: [] })))).toEqual({ labels: [] });
  });

  it('remembered values this repository no longer has are neither shown nor sent', () => {
    const p = PF.initialPicks(SPECS, { labels: ['bug', 'gone-label'], assignee: 'left-the-org' });
    expect(shown(p)).toEqual(['bug']);
    expect(plain(PF.choiceFields(SPECS, p))).toEqual({ labels: ['bug'] });
  });
});
