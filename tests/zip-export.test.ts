import { describe, it, expect } from 'vitest';
import { buildZipBlob } from '../src/exporters/zip-export';

async function zipBytes(entries: { name: string; data: Uint8Array; mtime?: number }[]): Promise<Uint8Array> {
  const blob = await buildZipBlob(entries);
  return new Uint8Array(await blob.arrayBuffer());
}

function u32(b: Uint8Array, off: number): number {
  return new DataView(b.buffer, b.byteOffset).getUint32(off, true);
}
function u16(b: Uint8Array, off: number): number {
  return new DataView(b.buffer, b.byteOffset).getUint16(off, true);
}

const MTIME = 1750000000000;

describe('buildZipBlob', () => {
  it('produces a well-formed archive: local header, central directory, EOCD', async () => {
    const data = new TextEncoder().encode('<html>bug report</html>');
    const b = await zipBytes([{ name: 'report.html', data, mtime: MTIME }]);

    expect(u32(b, 0)).toBe(0x04034b50); // local file header signature

    // EOCD is the last 22 bytes (no archive comment).
    const eocd = b.length - 22;
    expect(u32(b, eocd)).toBe(0x06054b50);
    expect(u16(b, eocd + 8)).toBe(1);   // entries on disk
    expect(u16(b, eocd + 10)).toBe(1);  // entries total

    // Central directory sits where EOCD says it does.
    const cdOffset = u32(b, eocd + 16);
    expect(u32(b, cdOffset)).toBe(0x02014b50);
  });

  it('records the filename and uncompressed size', async () => {
    const data = new TextEncoder().encode('x'.repeat(500));
    const b = await zipBytes([{ name: 'tracebug-replay.html', data, mtime: MTIME }]);

    const nameLen = u16(b, 26);
    const name = new TextDecoder().decode(b.subarray(30, 30 + nameLen));
    expect(name).toBe('tracebug-replay.html');
    expect(u32(b, 22)).toBe(500); // uncompressed size in local header
  });

  it('roundtrips entry data intact (deflate or store)', async () => {
    const original = new TextEncoder().encode('<html>' + 'repeated segment '.repeat(200) + '</html>');
    const b = await zipBytes([{ name: 'r.html', data: original, mtime: MTIME }]);

    const method = u16(b, 8);
    const csize = u32(b, 18);
    const nameLen = u16(b, 26);
    const stored = b.subarray(30 + nameLen, 30 + nameLen + csize);

    let restored: Uint8Array;
    if (method === 8) {
      const DS = (globalThis as { DecompressionStream?: unknown }).DecompressionStream;
      expect(typeof DS).toBe('function'); // method 8 implies the API existed
      const stream = new Blob([stored as BlobPart]).stream()
        .pipeThrough(new (DS as typeof DecompressionStream)('deflate-raw'));
      restored = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      expect(method).toBe(0); // STORE fallback
      restored = stored;
    }
    // Compare as plain arrays — jsdom and node Uint8Arrays are different
    // realms, so toEqual on the typed arrays fails despite identical bytes.
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it('handles multiple entries with correct central-directory offsets', async () => {
    const a = new TextEncoder().encode('first');
    const c = new TextEncoder().encode('second entry content');
    const b = await zipBytes([
      { name: 'a.html', data: a, mtime: MTIME },
      { name: 'b.txt', data: c, mtime: MTIME },
    ]);

    const eocd = b.length - 22;
    expect(u16(b, eocd + 10)).toBe(2);
    const cdOffset = u32(b, eocd + 16);
    // First central record points at offset 0; walk to the second record.
    expect(u32(b, cdOffset + 42)).toBe(0);
    const firstNameLen = u16(b, cdOffset + 28);
    const second = cdOffset + 46 + firstNameLen;
    expect(u32(b, second)).toBe(0x02014b50);
    expect(u32(b, second + 42)).toBeGreaterThan(0);
  });
});
