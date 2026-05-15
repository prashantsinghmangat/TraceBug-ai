// ── Storage / serialization error patterns ────────────────────────────────

import { ErrorPattern } from "./index";

export const storagePatterns: ErrorPattern[] = [
  {
    id: "storage-quota",
    pattern: /(quotaexceedederror|quota.*exceeded|storage.*full)/,
    hint: "browser storage quota exceeded — localStorage, IndexedDB, or cache filled up",
    fix: "prune older entries, switch to IndexedDB for larger payloads, or compress before storing",
    category: "Storage quota",
  },
  {
    id: "storage-json-parse",
    pattern: /(unexpected token.*in json|unexpected end of json input|json\.parse|invalid json)/,
    hint: "JSON.parse failed — the response or stored value isn't valid JSON",
    fix: "log the raw text first; check if the API is returning HTML/error pages instead of JSON",
    category: "Storage JSON",
  },
  {
    id: "storage-localstorage-disabled",
    pattern: /(localstorage.*not available|localstorage is null|access.*localstorage.*disabled)/,
    hint: "localStorage isn't available — incognito, Safari ITP, or storage disabled",
    fix: "feature-detect with try/catch; fall back to in-memory storage when missing",
    category: "Storage availability",
  },
  {
    id: "storage-indexeddb-version",
    pattern: /(versionerror|indexeddb.*version|requested version.*less than)/,
    hint: "IndexedDB version mismatch — schema changed but DB wasn't upgraded",
    fix: "bump the DB version and handle the upgradeneeded event; or delete and recreate during dev",
    category: "Storage IndexedDB",
  },
];
