// ── Reading extension sources in a test ───────────────────────────────────
//
// Several suites assert on extension source by slicing it between two
// multi-line anchors (`popup.js` between one function and the next). Those
// anchors are written with \n. On a Windows checkout with `core.autocrlf=true`
// the worktree copy is CRLF, every anchor misses, and the suite fails for a
// reason that has nothing to do with the code it is testing — either a false
// assertion failure (`slice(start, -1)` quietly returns the rest of the file)
// or a thrown "could not find the end of …" that takes the whole file down.
//
// `.gitattributes` now pins *.js to \n, but that only applies on checkout — an
// existing worktree, an editor that saves CRLF, or a zip can all still deliver
// CRLF. Normalizing on read makes these suites independent of it.
import { readFileSync } from "node:fs";

/** Read a source file with line endings normalized to \n. */
export function readText(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}
