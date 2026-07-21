// ── ZIP export ────────────────────────────────────────────────────────────
// Wraps the offline .html replay in a .zip — because GitHub issues accept
// .zip attachments by drag-and-drop but reject .html. Zero dependencies:
// the ZIP container format is ~40 lines of headers, and compression comes
// from the browser's CompressionStream("deflate-raw") when available,
// falling back to STORE (the html's replay stream is already gzipped
// internally, so STORE loses little).

import { BugReport, StoredSession } from "../types";
import { buildReplayBlob, HtmlReplayOptions, ExportedReplay, triggerDownload } from "./html-replay";

// ── CRC-32 (required by the ZIP format, computed over uncompressed data) ──

let _crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!_crcTable) {
    _crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      _crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = _crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const CS = (globalThis as { CompressionStream?: unknown }).CompressionStream;
    if (typeof CS !== "function") return null;
    const stream = new Blob([bytes as BlobPart]).stream()
      .pipeThrough(new (CS as typeof CompressionStream)("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

function dosDateTime(ts: number): { time: number; date: number } {
  const d = new Date(ts);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** Timestamp stamped into the archive (default: now). */
  mtime?: number;
}

/**
 * Build a ZIP archive Blob from the given entries. Standard zip32 layout:
 * [local header + data]* → central directory → end-of-central-directory.
 */
export async function buildZipBlob(entries: ZipEntry[]): Promise<Blob> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const { time, date } = dosDateTime(entry.mtime ?? Date.now());
    const crc = crc32(entry.data);

    const deflated = await deflateRaw(entry.data);
    // STORE when deflate is unavailable or (rarely) grows the data.
    const useDeflate = deflated !== null && deflated.length < entry.data.length;
    const stored = useDeflate ? deflated : entry.data;
    const method = useDeflate ? 8 : 0;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);       // local file header signature
    lv.setUint16(4, 20, true);               // version needed to extract
    lv.setUint16(6, 0x0800, true);           // flags: UTF-8 filenames
    lv.setUint16(8, method, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, stored.length, true);   // compressed size
    lv.setUint32(22, entry.data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);               // extra field length
    local.set(nameBytes, 30);

    const cdir = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdir.buffer);
    cv.setUint32(0, 0x02014b50, true);       // central directory signature
    cv.setUint16(4, 20, true);               // version made by
    cv.setUint16(6, 20, true);               // version needed
    cv.setUint16(8, 0x0800, true);           // flags: UTF-8 filenames
    cv.setUint16(10, method, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, stored.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    // 30..41: extra/comment/disk/attrs all zero
    cv.setUint32(42, offset, true);          // local header offset
    cdir.set(nameBytes, 46);

    parts.push(local, stored);
    central.push(cdir);
    offset += local.length + stored.length;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);         // end-of-central-directory signature
  ev.setUint16(8, entries.length, true);     // entries on this disk
  ev.setUint16(10, entries.length, true);    // entries total
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);            // central directory offset

  return new Blob([...parts, ...central, eocd] as BlobPart[], { type: "application/zip" });
}

/**
 * Export the session replay as a GitHub-attachable .zip containing the
 * self-contained .html. Triggers a browser download, mirroring
 * `exportSessionAsHtml`.
 */
export async function exportSessionAsZip(
  session: StoredSession,
  report: BugReport,
  options?: HtmlReplayOptions
): Promise<ExportedReplay> {
  const htmlBlob = await buildReplayBlob(session, report, options);
  const htmlBytes = new Uint8Array(await htmlBlob.arrayBuffer());

  // options.filename may arrive with an extension (mirrors the .html export) —
  // normalize to a base and derive both names from it.
  const base = (options?.filename || defaultZipBase(session.sessionId)).replace(/\.(zip|html)$/i, "");
  const blob = await buildZipBlob([{ name: base + ".html", data: htmlBytes, mtime: report.generatedAt }]);

  const filename = base + ".zip";
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  return { filename, blob, url, sizeBytes: blob.size };
}

function defaultZipBase(sessionId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `tracebug-replay-${sessionId.slice(0, 8)}-${stamp}`;
}
