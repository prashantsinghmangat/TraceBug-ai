// Phase 2a, third exposure path: no secret ENTRY field in the host page's DOM.
//
// Before 1.11 the in-page modal rendered token inputs AND pre-filled them with
// the stored secret as an attribute value:
//     <input data-ai-key type="password" value="${escapeHtml(existing.apiKey)}">
// Any script on the site under test could read that straight out of the DOM the
// moment the modal opened — faster than keylogging the field.
//
// This is a SOURCE invariant, not a DOM assertion: the two config modals are
// reachable only from inside an already-rendered Quick Bug modal, so driving
// them here would mean building a whole session. The DOM-level check (open the
// modal in a real browser, assert no password input and no token substring)
// belongs in the Phase 8 extension smoke test.
//
// What this does catch, and the reason it is worth having: someone adding a new
// secret field to either modal, or a new secret form elsewhere in the SDK UI,
// without the extension-mode guard.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const quickBugPath = join(srcDir, 'ui', 'quick-bug.ts');
const quickBug = readFileSync(quickBugPath, 'utf8');

/** Source of one top-level function, declaration to the next one. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} not found — did it get renamed?`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const SECRET_FIELD = /type="password"/;
const GUARD = 'isExtensionMode()';

describe.each(['showAIConfigModal', 'showIntegrationsConfigModal'])(
  '%s renders no secret field in extension mode',
  (fnName) => {
    const body = functionBody(quickBug, fnName);

    it('has an extension-mode guard', () => {
      expect(body).toContain(GUARD);
    });

    it('checks the guard BEFORE any secret field is rendered', () => {
      const guardAt = body.indexOf(GUARD);
      const fieldAt = body.search(SECRET_FIELD);
      expect(guardAt).toBeGreaterThan(-1);
      // A form with no password field at all would also be fine.
      if (fieldAt !== -1) expect(guardAt).toBeLessThan(fieldAt);
    });

    it('returns early rather than falling through to the form', () => {
      const guardAt = body.indexOf(GUARD);
      const afterGuard = body.slice(guardAt, guardAt + 400);
      expect(afterGuard).toContain('return;');
    });
  },
);

describe('no unguarded secret field anywhere in the SDK UI', () => {
  // Every password input in the SDK's UI must live in a function that first
  // checks the transport. If this fails, a new secret form was added without
  // the guard — put the entry point in the extension's options page instead.
  const uiDir = join(srcDir, 'ui');
  const files = readdirSync(uiDir).filter((f) => f.endsWith('.ts'));

  it('scans every src/ui file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s', (file) => {
    const source = readFileSync(join(uiDir, file), 'utf8');
    if (!SECRET_FIELD.test(source)) return; // no secret fields at all — fine
    expect(
      source.includes(GUARD),
      `${file} renders a password field but never checks ${GUARD}`,
    ).toBe(true);
  });
});

describe('pre-filled secret fields stay behind the guard', () => {
  // NOTE: the `value="${...apiKey...}"` pre-fill is still present, and that is
  // deliberate — in SDK (npm) mode the page belongs to the app's own developer
  // and the token is in their own localStorage, so the plan keeps that UX
  // unchanged. What must never happen is REACHING that markup in extension
  // mode, which the per-function guard tests above pin.
  //
  // This test only documents where the pre-fill lives, so that if it ever
  // appears in a function with no guard, the scan above is what fails.
  it('only occurs inside the two guarded modal functions', () => {
    const prefilled = /type="password"[^>]*value="\$\{[^}]*(apiKey|token|webhookUrl)/gi;
    const guarded = [
      functionBody(quickBug, 'showAIConfigModal'),
      functionBody(quickBug, 'showIntegrationsConfigModal'),
    ].join('\n');

    const allHits = quickBug.match(prefilled) || [];
    const guardedHits = guarded.match(prefilled) || [];
    expect(allHits.length).toBeGreaterThan(0); // SDK-mode forms still pre-fill
    expect(guardedHits.length).toBe(allHits.length);
  });
});
