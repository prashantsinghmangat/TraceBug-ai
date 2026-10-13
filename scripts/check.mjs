#!/usr/bin/env node
// One command for every gate. Prints one line per gate; full output only for a
// failure (last 40 lines). Replaces running the npm scripts one at a time and
// reading all of it — `ext:lint` alone is 751 lines, 69 warnings deep, and has
// been byte-identical for several phases.
//
//   node scripts/check.mjs             fast gates: typecheck, lint, test, build
//   node scripts/check.mjs --full      + build:ext, ext:lint, check:versions
//   node scripts/check.mjs test lint   only the named gates
//   node scripts/check.mjs --verbose   print full output even when a gate passes
//
// There is deliberately NO --firefox. `npm run ext:firefox` is `web-ext run`,
// which launches Firefox and stays running until the browser is closed — it is
// an interactive session, not a gate that returns a verdict. Wrapping it here
// just hung the runner until it timed out. Run it directly, and look at it:
//   npm run ext:firefox
//
// The summaries below are parsed from real output, line-anchored on purpose:
// web-ext prints its counts in a "Validation Summary:" block and THEN dumps
// every warning, so a floating /errors\s+(\d+)/ could match prose in a warning
// description instead of the count.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const FAST = ["typecheck", "lint", "test", "build"];
const FULL = [...FAST, "build:ext", "ext:lint", "check:versions"];
/** Scripts that never exit on their own, so they can never be gates. */
const INTERACTIVE = new Set(["ext:firefox", "dev", "test:watch", "ext:run"]);

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const named = args.filter((a) => !a.startsWith("--"));
const verbose = flags.has("--verbose");

let gates = named.length ? named : flags.has("--full") ? FULL : FAST;

// Refuse rather than hang. A reviewer who types --firefox, or names a watch
// script, gets told why in one line instead of waiting out a timeout.
if (flags.has("--firefox")) {
  console.log("check.mjs has no --firefox: `npm run ext:firefox` is `web-ext run`,");
  console.log("which stays open until you close Firefox. Run it directly and look at it.");
  process.exit(2);
}
const blocked = gates.filter((g) => INTERACTIVE.has(g));
if (blocked.length) {
  console.log(`not a gate (never exits on its own): ${blocked.join(", ")}`);
  console.log("Run it directly instead.");
  process.exit(2);
}

const BASE = "scripts/check-baseline.json";
const baseline = existsSync(BASE) ? JSON.parse(readFileSync(BASE, "utf8")) : {};
let baselineDirty = false;
let failed = 0;

for (const gate of gates) {
  const started = Date.now();
  const r = spawnSync("npm", ["run", "-s", gate], {
    encoding: "utf8",
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = (r.stdout || "") + (r.stderr || "");
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  let ok = r.status === 0;
  let note = "";

  if (gate === "test" || gate.startsWith("test:")) {
    // "      Tests  658 passed (658)" / "      Tests  2 failed | 656 passed (658)"
    const passed = out.match(/^\s*Tests\s+(?:(\d+) failed \| )?(\d+) passed/m);
    const files = out.match(/^\s*Test Files\s+(?:(\d+) failed \| )?(\d+) passed/m);
    if (passed) {
      note = `${passed[2]} passed`;
      if (files) note += `, ${files[2]} files`;
      if (passed[1]) { note += `, ${passed[1]} FAILED`; ok = false; }
    }
  }

  if (gate === "ext:lint") {
    // Validation Summary:
    //
    // errors          0
    // notices         0
    // warnings        69
    const n = (label) => {
      const m = out.match(new RegExp(`^${label}\\s+(\\d+)\\s*$`, "m"));
      return m ? Number(m[1]) : NaN;
    };
    const errors = n("errors");
    const warnings = n("warnings");
    if (Number.isNaN(errors) || Number.isNaN(warnings)) {
      // Never silently report "0 errors" because the format moved.
      ok = false;
      note = "could not read the Validation Summary — check the output";
    } else {
      note = `errors ${errors}, warnings ${warnings}`;
      if (errors > 0) ok = false;
      if (baseline.extLintWarnings === undefined) {
        baseline.extLintWarnings = warnings;
        baselineDirty = true;
        note += " (baseline saved)";
      } else if (warnings > baseline.extLintWarnings) {
        ok = false;
        note += ` — NEW: baseline is ${baseline.extLintWarnings}`;
      } else if (warnings < baseline.extLintWarnings) {
        // Good news, but the baseline has to be lowered deliberately or it
        // stops catching the next regression.
        note += ` — below the ${baseline.extLintWarnings} baseline; lower it in ${BASE}`;
      }
    }
  }

  if (gate === "check:versions") {
    const m = out.match(/all surfaces agree on (\S+)/);
    if (m) note = `all surfaces on ${m[1]}`;
    else if (!ok) note = "version drift — see the output";
  }

  console.log(`${ok ? "PASS" : "FAIL"}  ${gate.padEnd(14)} ${secs.padStart(5)}s  ${note}`);
  if (!ok) {
    failed++;
    console.log(tail(out, 40));
  } else if (verbose && out.trim()) {
    console.log(tail(out, 10_000));
  }
}

if (baselineDirty) writeFileSync(BASE, JSON.stringify(baseline, null, 2) + "\n");

console.log(failed ? `\n${failed} gate(s) failed` : "\nall gates passed");
process.exit(failed ? 1 : 0);

function tail(text, lines) {
  return text
    .trim()
    .split("\n")
    .slice(-lines)
    .map((l) => "  | " + l)
    .join("\n");
}
