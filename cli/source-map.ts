// ── Dependency-free source-map resolution ─────────────────────────────────
// Captured stack traces point at minified bundles (`assets/index-ab12.js:1:43210`);
// the agent fixing the bug needs original file/line. This module parses stack
// frames, finds matching `.map` files in the repo the MCP server is running
// in, and decodes the V3 mappings (base64 VLQ) — ~150 lines instead of a
// runtime dependency, keeping the published CLI package dependency-free.

import * as fs from "node:fs";
import * as path from "node:path";

// ── Stack-frame parsing ──────────────────────────────────────────────────

export interface StackFrame {
  fn: string;
  /** Bundle URL or path as captured (may be http://…/assets/x.js). */
  file: string;
  /** 1-based. */
  line: number;
  /** 1-based (as browsers print them). */
  column: number;
  raw: string;
}

const V8_FRAME = /^\s*at\s+(?:(.*?)\s+\()?((?:https?|file|webpack):\/\/[^\s)]+|[^\s)]+?):(\d+):(\d+)\)?\s*$/;
const FF_FRAME = /^\s*(.*?)@((?:https?|file):\/\/[^\s]+|[^\s]+?):(\d+):(\d+)\s*$/;

/** Parse a browser stack trace into frames. Unparseable lines are skipped. */
export function parseStackFrames(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const line of String(stack || "").split("\n")) {
    const m = V8_FRAME.exec(line) || FF_FRAME.exec(line);
    if (!m) continue;
    frames.push({
      fn: (m[1] || "").trim() || "(anonymous)",
      file: m[2],
      line: parseInt(m[3], 10),
      column: parseInt(m[4], 10),
      raw: line.trim(),
    });
  }
  return frames;
}

// ── VLQ / mappings decoding (Source Map v3) ──────────────────────────────

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_MAP: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_MAP[B64[i]] = i;

/** Decode one VLQ value starting at `pos`; returns [value, nextPos]. */
function decodeVlq(s: string, pos: number): [number, number] {
  let result = 0;
  let shift = 0;
  let digit: number;
  do {
    digit = B64_MAP[s[pos++]];
    if (digit === undefined) throw new Error("bad VLQ");
    result += (digit & 31) << shift;
    shift += 5;
  } while (digit & 32);
  const negative = result & 1;
  result >>= 1;
  return [negative ? -result : result, pos];
}

export interface SourceMapV3 {
  version: number;
  sources: string[];
  names?: string[];
  mappings: string;
  sourceRoot?: string;
}

export interface OriginalPosition {
  source: string;
  /** 1-based. */
  line: number;
  /** 0-based, as sourcemaps store it. */
  column: number;
  name?: string;
}

/**
 * Resolve a generated (line, column) — both 1-based, as stacks print them —
 * to the original position. Returns null when the map has no segment there.
 */
export function resolvePosition(map: SourceMapV3, genLine: number, genColumn: number): OriginalPosition | null {
  const lines = map.mappings.split(";");
  const targetLine = genLine - 1;
  if (targetLine < 0 || targetLine >= lines.length) return null;

  // State accumulates across the whole mappings string except genCol (per line).
  let srcIdx = 0, srcLine = 0, srcCol = 0, nameIdx = 0;
  let best: OriginalPosition | null = null;

  for (let li = 0; li <= targetLine; li++) {
    const segs = lines[li];
    let genCol = 0;
    let pos = 0;
    while (pos < segs.length) {
      if (segs[pos] === ",") { pos++; continue; }
      let v: number;
      try {
        [v, pos] = decodeVlq(segs, pos);
      } catch {
        return best;
      }
      genCol += v;
      let fields = 1;
      if (pos < segs.length && segs[pos] !== "," && segs[pos] !== undefined) {
        try {
          [v, pos] = decodeVlq(segs, pos); srcIdx += v;
          [v, pos] = decodeVlq(segs, pos); srcLine += v;
          [v, pos] = decodeVlq(segs, pos); srcCol += v;
          fields = 4;
          if (pos < segs.length && segs[pos] !== ",") {
            [v, pos] = decodeVlq(segs, pos); nameIdx += v;
            fields = 5;
          }
        } catch {
          return best;
        }
      }
      // Last segment at-or-before the target column wins (stack columns are
      // 1-based; segment genCols 0-based). The line's first segment is the
      // fallback so a slightly-off column still resolves.
      if (li === targetLine && fields >= 4 && (genCol <= genColumn - 1 || best === null)) {
        best = {
          source: (map.sourceRoot ? map.sourceRoot.replace(/\/?$/, "/") : "") + (map.sources[srcIdx] ?? "?"),
          line: srcLine + 1,
          column: srcCol,
          name: fields === 5 ? map.names?.[nameIdx] : undefined,
        };
      }
    }
  }
  return best;
}

// ── Map-file discovery ───────────────────────────────────────────────────

const MAP_SKIP_DIRS = new Set(["node_modules", ".git", ".next/cache", "coverage"]);
const MAP_SCAN_DEPTH = 6;

/** Find `<bundleBasename>.map` under `searchDir` (build output dirs included —
 *  that's where maps live). First match wins; cache per scan. */
export function findMapFile(searchDir: string, bundleBasename: string): string | null {
  const target = bundleBasename + ".map";
  const walk = (dir: string, depth: number): string | null => {
    if (depth > MAP_SCAN_DEPTH) return null;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    // Files first so shallow matches win before descending.
    for (const e of entries) {
      if (!e.isDirectory() && e.name === target) return path.join(dir, e.name);
    }
    for (const e of entries) {
      if (e.isDirectory() && !MAP_SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) {
        const hit = walk(path.join(dir, e.name), depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(searchDir, 0);
}

export interface ResolvedFrame extends StackFrame {
  original?: OriginalPosition;
  mapFile?: string;
}

/**
 * Resolve every frame of a stack against `.map` files found under `searchDir`.
 * Frames whose map can't be found or decoded pass through unresolved.
 */
export function resolveStackWithMaps(stack: string, searchDir: string): ResolvedFrame[] {
  const frames = parseStackFrames(stack);
  const mapCache = new Map<string, SourceMapV3 | null>();
  const pathCache = new Map<string, string | null>();

  return frames.map((frame): ResolvedFrame => {
    const basename = path.basename(frame.file.split("?")[0].split("#")[0]);
    if (!/\.(m?js|cjs)$/.test(basename)) return frame;

    let mapPath = pathCache.get(basename);
    if (mapPath === undefined) {
      mapPath = findMapFile(searchDir, basename);
      pathCache.set(basename, mapPath);
    }
    if (!mapPath) return frame;

    let map = mapCache.get(mapPath);
    if (map === undefined) {
      try {
        const parsed = JSON.parse(fs.readFileSync(mapPath, "utf8")) as SourceMapV3;
        map = parsed && parsed.version === 3 && typeof parsed.mappings === "string" ? parsed : null;
      } catch {
        map = null;
      }
      mapCache.set(mapPath, map);
    }
    if (!map) return frame;

    const original = resolvePosition(map, frame.line, frame.column);
    return original ? { ...frame, original, mapFile: mapPath } : { ...frame, mapFile: mapPath };
  });
}
