import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseStackFrames,
  resolvePosition,
  findMapFile,
  resolveStackWithMaps,
  type SourceMapV3,
} from '../cli/source-map';

// Hand-encoded VLQ mappings for a one-line bundle:
//   segment "AAAA"  → genCol 0 maps to sources[0] line 1 (0-based 0), col 0
//   segment "QAEIA" → genCol +8 maps to line +2 (→ line 3), col +4, names[0]
const MAP: SourceMapV3 = {
  version: 3,
  sources: ['src/app.ts'],
  names: ['greet'],
  mappings: 'AAAA,QAEIA',
};

describe('parseStackFrames', () => {
  it('parses V8-style frames with and without function names', () => {
    const frames = parseStackFrames([
      'TypeError: boom',
      '    at handleClick (http://localhost:5173/assets/index-ab12.js:1:4321)',
      '    at http://localhost:5173/assets/index-ab12.js:1:99',
    ].join('\n'));
    expect(frames.length).toBe(2);
    expect(frames[0]).toMatchObject({ fn: 'handleClick', file: 'http://localhost:5173/assets/index-ab12.js', line: 1, column: 4321 });
    expect(frames[1].fn).toBe('(anonymous)');
    expect(frames[1].column).toBe(99);
  });

  it('parses Firefox-style frames', () => {
    const frames = parseStackFrames('handleClick@http://localhost:5173/assets/index-ab12.js:1:4321');
    expect(frames.length).toBe(1);
    expect(frames[0].fn).toBe('handleClick');
    expect(frames[0].line).toBe(1);
  });

  it('skips unparseable lines', () => {
    expect(parseStackFrames('TypeError: boom\nsomething unrelated')).toEqual([]);
  });
});

describe('resolvePosition', () => {
  it('resolves a column to the last segment at or before it', () => {
    // stack column 9 (1-based) → generated col 8 → the "QAEIA" segment
    const pos = resolvePosition(MAP, 1, 9)!;
    expect(pos.source).toBe('src/app.ts');
    expect(pos.line).toBe(3);
    expect(pos.column).toBe(4);
    expect(pos.name).toBe('greet');
  });

  it('falls back to the first segment for early columns', () => {
    const pos = resolvePosition(MAP, 1, 1)!;
    expect(pos.line).toBe(1);
    expect(pos.column).toBe(0);
  });

  it('accumulates source lines across generated lines', () => {
    // line 2 segment "AACA" → srcLine +1 → original line 2
    const multi: SourceMapV3 = { version: 3, sources: ['src/app.ts'], mappings: 'AAAA;AACA' };
    const pos = resolvePosition(multi, 2, 1)!;
    expect(pos.line).toBe(2);
  });

  it('returns null for lines outside the map', () => {
    expect(resolvePosition(MAP, 99, 1)).toBeNull();
  });

  it('applies sourceRoot as a prefix', () => {
    const rooted: SourceMapV3 = { ...MAP, sourceRoot: 'webpack://myapp' };
    expect(resolvePosition(rooted, 1, 9)!.source).toBe('webpack://myapp/src/app.ts');
  });
});

describe('map discovery + end-to-end stack resolution', () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-sourcemap-'));
    fs.mkdirSync(path.join(dir, 'dist', 'assets'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'node_modules', 'trap'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'dist', 'assets', 'index-ab12.js.map'), JSON.stringify(MAP));
    // A decoy inside node_modules must never win.
    fs.writeFileSync(path.join(dir, 'node_modules', 'trap', 'index-ab12.js.map'), JSON.stringify({ ...MAP, sources: ['WRONG'] }));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('finds the map in build output but not node_modules', () => {
    const found = findMapFile(dir, 'index-ab12.js')!;
    expect(found).toContain('dist');
    expect(found).not.toContain('node_modules');
  });

  it('returns null when no map matches', () => {
    expect(findMapFile(dir, 'nope.js')).toBeNull();
  });

  it('resolves a full stack against discovered maps', () => {
    const frames = resolveStackWithMaps(
      'TypeError: boom\n    at handleClick (http://localhost:5173/assets/index-ab12.js:1:9)',
      dir
    );
    expect(frames.length).toBe(1);
    expect(frames[0].original).toMatchObject({ source: 'src/app.ts', line: 3 });
    expect(frames[0].mapFile).toContain('index-ab12.js.map');
  });

  it('passes frames through unresolved when the map is missing', () => {
    const frames = resolveStackWithMaps('    at x (http://site/assets/other-999.js:1:5)', dir);
    expect(frames.length).toBe(1);
    expect(frames[0].original).toBeUndefined();
  });
});
