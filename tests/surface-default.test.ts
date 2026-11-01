// Tab is the default capture surface on Chrome, but only for users still on
// the default — the same "accepting a default is not choosing it" rule as
// videoSetBy (record-opts.test.ts). A Desktop choice is kept. Firefox has no
// Tab at all.
import { describe, it, expect } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readText } from './helpers/read-source';

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');
const SOURCE = readText(join(extDir, 'popup.js'));

/** One function out of popup.js's DOMContentLoaded closure (same approach as record-opts.test.ts). */
function sliceFunction(declaration: string): string {
  const start = SOURCE.indexOf(declaration);
  if (start < 0) throw new Error(`not found in popup.js — did it move or get renamed? ${declaration}`);
  const end = SOURCE.indexOf('\n  }\n', start);
  if (end < 0) throw new Error(`could not find the end of ${declaration} in popup.js`);
  return SOURCE.slice(start, end + 4);
}

function resolve(stored: Record<string, unknown>, tabDeclared = true) {
  const sandbox = { result: undefined as unknown };
  runInContext(
    sliceFunction('  function resolveSurface(stored, tabDeclared) {').trim() +
      `\nresult = resolveSurface(${JSON.stringify(stored)}, ${tabDeclared});`,
    createContext(sandbox),
  );
  return sandbox.result as Record<string, unknown>;
}

describe('popup.js picks the capture surface', () => {
  it('starts a fresh install on Tab', () => {
    expect(resolve({})).toEqual({ surfaceMode: 'tab', surfaceSetBy: 'default' });
  });

  it('moves a flagless "desktop" (the old default) to Tab', () => {
    expect(resolve({ surfaceMode: 'desktop' })).toEqual({ surfaceMode: 'tab', surfaceSetBy: 'default' });
  });

  it('keeps a user who chose Desktop', () => {
    expect(resolve({ surfaceMode: 'desktop', surfaceSetBy: 'user' }))
      .toEqual({ surfaceMode: 'desktop', surfaceSetBy: 'user' });
  });

  it('treats a flagless "tab" from 1.11.3–1.11.4 as chosen', () => {
    // Tab was never the default there, so whoever has it picked it.
    expect(resolve({ surfaceMode: 'tab' })).toEqual({ surfaceMode: 'tab', surfaceSetBy: 'user' });
  });

  it('is always Desktop where the build has no tabCapture (Firefox)', () => {
    expect(resolve({}, false)).toMatchObject({ surfaceMode: 'desktop' });
    expect(resolve({ surfaceMode: 'tab', surfaceSetBy: 'user' }, false)).toMatchObject({ surfaceMode: 'desktop' });
  });

  it('decides Tab from the required manifest permissions, not the browser name', () => {
    // tabCapture is required on Chrome (a runtime grant can never record the
    // tab it was granted on) and absent from the Firefox build.
    expect(SOURCE).toContain('chrome.runtime.getManifest().permissions');
    expect(SOURCE).not.toContain('optional_permissions');
  });

  it('stamps surfaceSetBy only from the two surface buttons', () => {
    expect(SOURCE.match(/surfaceSetBy = "user";/g) ?? []).toHaveLength(2);
  });

  it('saves surfaceSetBy with the other options', () => {
    expect(sliceFunction('  function saveRecordOpts() {')).toContain('surfaceSetBy,');
    expect(sliceFunction('  async function loadRecordOpts() {')).toContain('surfaceSetBy: stored.surfaceSetBy,');
  });

  it('never asks for tabCapture at runtime', () => {
    expect(SOURCE).not.toContain('permissions.request({ permissions: ["tabCapture"] }');
  });
});
