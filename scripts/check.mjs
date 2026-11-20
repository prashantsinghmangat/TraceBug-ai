#!/usr/bin/env node
// One command for every gate. Prints one line per gate; full output only for a
// failure (last 40 lines). Replaces running the npm scripts one at a time and
// reading all of it — `ext:lint` alone is 751 lines, 69 warnings deep, and has
// been byte-identical for several phases.
//
//   node scripts/check.mjs             fast gates: typecheck, lint, test, build
//   node scripts/check.mjs --full      + build:ext, ext:lint, check:versions, e2e:quality,
//                                      e2e:audit, e2e:audit-ext, e2e:audit-gate, e2e:email-ask, e2e:annotate,
//                                      e2e:trim, e2e:video-cut, e2e:ticket-view, e2e:shot-editor, e2e:tracker, e2e:github-connect, e2e:firefox-token, e2e:inpage-panel, e2e:panel-connect, e2e:linear, e2e:hub (draw toolbar Chromium + Firefox; ticket video
//                                      trim UI; the cut in Firefox + installed Chrome/Edge; report-quality benchmark on
//                                      the real extension; Site Audit engine on a planted-defect
//                                      page; the Audit action through the packaged extension; the tracker Create panel;
//                                      all need `npx playwright install chromium` once)
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
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FAST = ["typecheck", "lint", "test", "build"];
const FULL = [...FAST, "build:ext", "ext:lint", "check:versions", "e2e:quality", "e2e:audit", "e2e:audit-ext", "e2e:audit-gate", "e2e:email-ask", "e2e:annotate", "e2e:trim", "e2e:video-cut", "e2e:ticket-view", "e2e:shot-editor", "e2e:tracker", "e2e:github-connect", "e2e:firefox-token", "e2e:inpage-panel", "e2e:panel-connect", "e2e:linear", "e2e:hub"];
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

// One run at a time. Two overlapping runs (a run that was interrupted but
// whose children kept going, plus a new one) starve each other: both flaky
// failures seen so far — vitest's "reading 'config'" worker crash and the
// Linear sign-in timeouts — happened only in runs started right after another
// was stopped, and never reproduced alone or under plain CPU load.
const LOCK = join(tmpdir(), "tracebug-check.lock");
if (existsSync(LOCK)) {
  const pid = Number(readFileSync(LOCK, "utf8"));
  let alive = false;
  try { process.kill(pid, 0); alive = true; } catch {}
  if (alive) {
    console.log(`another check.mjs (pid ${pid}) is still running — wait for it or end it first.`);
    process.exit(2);
  }
}
// A lock whose pid is dead (a run that was killed) is stale and is taken over.
writeFileSync(LOCK, String(process.pid));

// The running gate's whole process tree (npm → node → browsers) dies with
// this run: on exit, on Ctrl+C, and on an error here. Windows has no process
// groups for this, so taskkill /T walks the tree while its root is alive.
let current = null;
function killTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGKILL");
  } catch {}
}
/** After a failed gate: e2e browsers left on TraceBug's temp profiles (their
 *  parents are gone, so no tree reaches them). Windows only; elsewhere the
 *  process group above takes them. */
function sweepE2eBrowsers() {
  if (process.platform !== "win32") return;
  const dir = tmpdir().replace(/'/g, "''");
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('--user-data-dir=${dir}\tb-') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try { spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore", timeout: 30000 }); } catch {}
}
process.on("exit", () => { killTree(current); try { unlinkSync(LOCK); } catch {} });
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { console.log(`
${sig}: stopping`); process.exit(130); });
process.on("uncaughtException", (e) => { console.error(e); process.exit(1); });

/** Run one npm script; the child is tracked so it can be killed with us. */
function runGate(gate) {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "-s", gate], { shell: true, detached: process.platform !== "win32" });
    current = child;
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => { current = null; resolve({ status: code, out }); });
    child.on("error", (e) => { current = null; resolve({ status: 1, out: out + String(e) }); });
  });
}
// The full output of every failing gate, for the next time a flake shows up
// (the 40-line tail below cut off what caused the vitest crash).
const LOGS = join(tmpdir(), "tracebug-check-logs");

const BASE = "scripts/check-baseline.json";
const baseline = existsSync(BASE) ? JSON.parse(readFileSync(BASE, "utf8")) : {};
let baselineDirty = false;
let failed = 0;

for (const gate of gates) {
  const started = Date.now();
  const r = await runGate(gate);
  const out = r.out;
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

  if (gate.startsWith("e2e:")) {
    // "ALL CHECKS PASSED — 84/84 checks passed" / "3 CHECK(S) FAILED — 81/84 checks passed"
    const m = out.match(/(\d+)\/(\d+) checks passed/);
    const label = { "e2e:quality": "report", "e2e:audit": "audit", "e2e:audit-ext": "extension audit",
      "e2e:audit-gate": "audit sign-in gate", "e2e:email-ask": "email ask", "e2e:annotate": "annotate toolbar", "e2e:trim": "video trim UI", "e2e:video-cut": "video cut", "e2e:ticket-view": "ticket view", "e2e:shot-editor": "screenshot editor", "e2e:tracker": "tracker create panel", "e2e:github-connect": "GitHub connect", "e2e:firefox-token": "Firefox token path", "e2e:inpage-panel": "in-page Create panel", "e2e:panel-connect": "Connect from the panel", "e2e:linear": "Linear connect + attachments", "e2e:hub": "Integrations hub" }[gate] || "e2e";
    if (m) note = `${m[1]}/${m[2]} ${label} checks`;
    else { ok = false; note = "no result line — see the output"; }
  }

  console.log(`${ok ? "PASS" : "FAIL"}  ${gate.padEnd(14)} ${secs.padStart(5)}s  ${note}`);
  if (!ok) {
    failed++;
    if (gate.startsWith("e2e:")) sweepE2eBrowsers();
    console.log(tail(out, 40));
    try {
      mkdirSync(LOGS, { recursive: true });
      const file = join(LOGS, gate.replace(/[^a-z0-9-]/gi, "_") + ".log");
      writeFileSync(file, out);
      console.log(`  | full output: ${file}`);
    } catch {}
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
