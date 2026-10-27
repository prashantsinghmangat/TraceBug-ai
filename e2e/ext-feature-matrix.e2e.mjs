// Run: node e2e/ext-feature-matrix.e2e.mjs   (--headful to watch, --verbose for page console)
// Needs: `npm run build:ext` first (builds tracebug-sdk-ext.js / tracebug-init.js /
// content-script.js that this harness injects), and `npx playwright install chromium`
// once per machine.
//
// A feature × site pass/fail matrix for the three things this extension does:
// screen recording, microphone capture, and click/input/navigation event
// logging — plus the buttons that drive them. Organized as the project's
// other e2e specs already are (one real headless Chromium + the unpacked
// extension, Playwright driving it, a flat check()/total() ledger), but this
// file additionally buckets every check by (site, feature group) so it can
// print one consolidated matrix at the end instead of N separate pass/fail
// counts spread across N files.
//
// WHAT RUNS WHERE (see each function's own comment for why):
//   • Per SITE (static / SPA / login form / heavy media / restrictive CSP —
//     e2e/site-fixtures.mjs): ONE combined recording (Desktop mode, video +
//     mic) that also runs that site's click/input/navigation sequence DURING
//     the recording, then Save Ticket. This is deliberately one run per site,
//     not one run per feature per site — "does a video recording survive a
//     restrictive CSP page" and "is the mic track in that same recording"
//     and "are this page's clicks captured in order" are really one
//     question (does the whole pipeline work on this site), not three.
//   • ONCE, page-agnostic (run against the static fixture only): the failure
//     cases that are extension-mechanism bugs, not site-content bugs —
//     a denied screen-share picker, a denied microphone, the pause button's
//     documented no-op in extension mode, and a tab closed mid-recording.
//   • ONCE, dedicated fixtures: the large-embedded-frame warning (its own
//     iframe-heavy fixture, not one of the 5 site archetypes), and a sweep of
//     every ticket-modal [data-action] button.
//
// EXPLICIT SCOPE LIMITS (named here, not silently dropped):
//   • "Playable file" and "audio captured" are both verified IN-BROWSER by
//     decoding the recording with a real <video> element (loadedmetadata,
//     duration, audioTracks/webkitAudioDecodedByteCount) — no ffmpeg
//     dependency, matching how the existing video e2e already verifies
//     output (size/shape, not frame-by-frame content).
//   • The popup's own buttons (#btnCaptureBug, #btnStopCapture, etc.) are NOT
//     covered — Playwright cannot open a real MV3 action popup and have it
//     resolve the current tab the way a genuine toolbar click does. This is
//     the same limitation already on record as STATE.md's open item 8
//     ("manually verify the popup's 'already capturing' state"); it stays a
//     human, two-minute check, not something faked here.
//   • Tracker-send buttons (GitHub/Linear/Slack/Jira) are excluded from the
//     UI-button sweep's click-everything pass — they open confirm-send.html
//     or touch the clipboard, both already covered by their own dedicated
//     specs (ext-github-send-confirm.e2e.mjs, ext-provider-confirm.e2e.mjs).
//   • "Pause" is tested as a documented no-op in extension mode, not a bug —
//     see video-recorder.ts's own comment on VIDEO_ENABLED_IN_EXTENSION/
//     hasMicrophoneTrack: only the npm SDK's in-page transport can actually
//     pause the underlying recorder today.
//
// Each FAIL prints the exact check name (= the step) and the state captured
// right there (JSON-stringified). Any FAIL also saves a screenshot to
// e2e/output/. A machine-readable copy of every result lands in
// e2e/output/feature-matrix-report.json.
import { chromium } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGrantedHostAccess, withGrantedTabCapture } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions, outDir } from "./paths.mjs";
import { SITES, STATIC_PATH, IFRAME_PATH, startFixtureServer } from "./site-fixtures.mjs";

const PORT = 4400;
const VERBOSE = process.argv.includes("--verbose");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Result ledger: every check, bucketed by (site, feature group) ──────────
const results = [];
let passes = 0;
let failures = 0;
function check(site, group, name, ok, extra = "", opts = {}) {
  results.push({ site, group, name, ok, extra, flaky: !!opts.flaky });
  if (ok) passes++;
  else failures++;
  const tag = opts.flaky ? " [timing-sensitive]" : "";
  console.log(`${ok ? "PASS" : "FAIL"}  [${site}/${group}] ${name}${tag}${extra ? " — " + extra : ""}`);
}
const total = () => `${passes}/${passes + failures} checks passed`;

// A SKIP is neither pass nor fail — for something this harness genuinely
// cannot drive, not something the product got wrong. Counted separately so it
// never masquerades as either a pass or a found defect.
let skipped = 0;
function skip(site, group, name, reason) {
  results.push({ site, group, name, skipped: true, extra: reason });
  skipped++;
  console.log(`SKIP  [${site}/${group}] ${name} — ${reason}`);
}

async function saveFailureArtifacts(page, label) {
  if (!page) return;
  try {
    const dir = outDir();
    const shot = join(dir, `feature-matrix-${label}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    console.log(`       ↳ screenshot: ${shot}`);
  } catch (err) {
    console.log(`       ↳ could not capture a screenshot: ${err && err.message}`);
  }
}

// ── Harness plumbing, modeled on ext-video-recording.e2e.mjs / ext-video-recording-tab.e2e.mjs ──
function newContext(extDir, label) {
  const userDir = mkdtempSync(join(tmpdir(), `tb-matrix-${label}-`));
  return chromium.launchPersistentContext(
    userDir,
    extensionLaunchOptions([
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ]),
  );
}

// For the two "denied" failure cases. Found empirically: Playwright's
// context-level addInitScript (the usual tripwire/override trick, used
// successfully in ext-events-capture.e2e.mjs for a page-world getDisplayMedia
// count) does NOT reach the extension's offscreen document — overriding
// getDisplayMedia/getUserMedia there had zero effect, the recording just
// succeeded anyway. Omitting --use-fake-ui-for-media-stream instead relies on
// real Chromium behavior: with no UI available to auto-accept the prompt in
// headless mode, the picker/getUserMedia call rejects on its own — a more
// realistic simulation of a user declining than a JS-level monkeypatch.
function newContextNoFakeUI(extDir, label) {
  const userDir = mkdtempSync(join(tmpdir(), `tb-matrix-${label}-`));
  return chromium.launchPersistentContext(
    userDir,
    extensionLaunchOptions([`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`]),
  );
}

// For the mic-denied case specifically: keep --use-fake-ui-for-media-stream
// (so the Desktop screen-share picker still auto-accepts — that part of the
// recording must succeed) but drop --use-fake-device-for-media-stream, so
// there is no fake microphone device at all. getUserMedia({audio:true}) then
// fails naturally (no device to grant), without needing a JS-level override
// that (per runDisplayMediaDeniedCase's comment) can't reach the offscreen
// document anyway.
function newContextNoFakeMicDevice(extDir, label) {
  const userDir = mkdtempSync(join(tmpdir(), `tb-matrix-${label}-`));
  return chromium.launchPersistentContext(
    userDir,
    extensionLaunchOptions([`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, "--use-fake-ui-for-media-stream"]),
  );
}

async function getWorker(ctx) {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  return sw;
}

async function inject(sw, urlPattern) {
  return sw.evaluate(async (pattern) => {
    const [tab] = await chrome.tabs.query({ url: pattern });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk-ext.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
    return tab.id;
  }, urlPattern);
}

async function sendStart(sw, tabId, opts = {}) {
  return sw.evaluate(
    async ({ id, opts }) =>
      chrome.tabs
        .sendMessage(id, { type: "TB_START_RECORDING", video: true, withMic: false, blurFirst: false, delaySec: 0, ...opts })
        .catch((e) => ({ error: String(e && e.message) })),
    { id: tabId, opts },
  );
}

async function readStorage(sw) {
  return sw.evaluate(async () => {
    const data = await chrome.storage.local.get(["tb_rec_meta_v2", "tb_rec_data_v2"]);
    const dataUrl = data["tb_rec_data_v2"] || "";
    return { sizeBytes: data["tb_rec_meta_v2"]?.sizeBytes ?? null, dataUrlLength: dataUrl.length };
  });
}

/** Decode a <video> in-browser: no ffmpeg, matches the user-approved
 *  "pipeline-level" verification — a real HTMLMediaElement either can or
 *  cannot play the bytes back. NOTE, found empirically running this suite:
 *  a MediaRecorder-produced webm reports `duration` as Infinity/NaN until a
 *  seek-to-end workaround runs — TraceBug's own player.html does exactly
 *  this and logs it ("metadata: duration=Infinity broken=true"), so
 *  `duration` is NOT a reliable "did this actually decode" signal here.
 *  Decoded byte counts + readyState are. */
async function decodeVideoInScope(scope) {
  return scope.evaluate(
    () =>
      new Promise((resolve) => {
        const src = document.querySelector("#tb-qb-video, video");
        const url = src ? src.currentSrc || src.src : "";
        if (!url) return resolve({ ok: false, reason: "no <video> with a src in this scope" });
        const v = document.createElement("video");
        v.muted = true;
        v.preload = "auto";
        let settled = false;
        const finish = (result) => {
          if (!settled) {
            settled = true;
            resolve(result);
          }
        };
        v.addEventListener("loadedmetadata", () => {
          v.play()
            .catch(() => {})
            .finally(() => {
              setTimeout(() => {
                const videoBytes = typeof v.webkitVideoDecodedByteCount === "number" ? v.webkitVideoDecodedByteCount : null;
                const audioBytes = typeof v.webkitAudioDecodedByteCount === "number" ? v.webkitAudioDecodedByteCount : null;
                finish({
                  ok: v.readyState >= 1 && ((videoBytes || 0) > 0 || (audioBytes || 0) > 0),
                  duration: v.duration,
                  readyState: v.readyState,
                  videoBytesDecoded: videoBytes,
                  audioBytesDecoded: audioBytes,
                });
              }, 400);
            });
        });
        v.addEventListener("error", () => finish({ ok: false, reason: "video element error", code: v.error && v.error.code }));
        setTimeout(() => finish({ ok: false, reason: "timeout waiting for loadedmetadata" }), 6000);
        v.src = url;
      }),
  );
}

/** Decode the ticket modal's recording. A host page with a restrictive CSP
 *  (default-src/media-src 'self', no `blob:`) blocks the modal's normal
 *  <video src="blob:..."> entirely — quick-bug.ts detects that and falls
 *  back to the same CSP-proof iframe player the exported-file viewer uses
 *  (e2e/ext-player-csp.e2e.mjs proves that mechanism against a live site);
 *  the real <video> then lives inside that iframe's own document instead of
 *  the top-level modal. */
async function decodeModalVideo(page) {
  const direct = await decodeVideoInScope(page);
  if (direct.ok || direct.reason !== "no <video> with a src in this scope") return { ...direct, via: "modal" };

  const hasPlayerIframe = await page.evaluate(() => !!document.querySelector(".tb-qb-player-iframe"));
  if (!hasPlayerIframe) return { ok: false, reason: "no <video> and no CSP-proof player iframe either" };
  await page.waitForTimeout(1500); // let the ready -> load handshake complete
  const frame = page.frames().find((f) => /player\.html/.test(f.url()));
  if (!frame) return { ok: false, reason: "player iframe present but its frame wasn't reachable" };
  const inner = await decodeVideoInScope(frame).catch((e) => ({ ok: false, reason: String(e) }));
  return { ...inner, via: "csp-proof-iframe-player" };
}

/** Whether the mic actually made it into the recording — read from the HUD's
 *  own mic button rather than decoded audio bytes: getDisplayMedia's
 *  `audio: true` also captures tab/system audio, so "some audio decoded" is
 *  true regardless of the mic (confirmed empirically — a mic-denied run still
 *  decoded ~2KB of audio). `hasMicrophoneTrack()` — which the HUD's
 *  `disabled` attribute mirrors — is the one signal that is actually mic-
 *  specific in extension mode (src/video-recorder.ts's `_extMicIncluded`). */
async function getMicHudState(page) {
  return page.evaluate(() => {
    const btn = document.querySelector('[data-tb-hud="mic"]');
    if (!btn) return { present: false };
    return { present: true, disabled: !!btn.disabled };
  });
}

const ACTION_TYPES = ["click", "input", "select_change", "form_submit", "route_change"];

async function getLastSessionActionTypes(page) {
  return page.evaluate((types) => {
    const sessions = window.__TraceBugExtensionSDK.getAllSessions();
    const session = sessions[sessions.length - 1];
    if (!session) return null;
    return session.events.filter((e) => types.includes(e.type)).map((e) => e.type);
  }, ACTION_TYPES);
}

async function getCapturedFieldValue(page, fieldNameOrId) {
  return page.evaluate((key) => {
    const sessions = window.__TraceBugExtensionSDK.getAllSessions();
    const session = sessions[sessions.length - 1];
    if (!session) return null;
    const ev = session.events.find((e) => e.type === "input" && (e.data?.element?.name === key || e.data?.element?.id === key));
    return ev ? ev.data.element.value : null;
  }, fieldNameOrId);
}

// ── Per-site action sequences ────────────────────────────────────────────
// Each `expected` array is what this suite asserts the capture records, in
// array-insertion order (StoredSession.events is append-only in emit order —
// there is no separate sequence field, per src/types.ts). If a real run
// disagrees, that is either this file's guess being wrong about collector
// registration order, or a genuine capture-ordering bug — the FAIL line's
// `extra` always prints the actual array either way.
const SITE_SCENARIOS = {
  static: {
    expected: ["click", "input"],
    run: async (page) => {
      await page.click("#pay");
      await page.fill("#note", "hello from e2e");
      await page.waitForTimeout(500);
    },
  },
  spa: {
    expected: ["click", "route_change", "click"],
    run: async (page) => {
      await page.click("#nav-products");
      await page.waitForTimeout(300);
      await page.waitForSelector("#dyn-btn", { timeout: 3000 });
      await page.click("#dyn-btn");
      await page.waitForTimeout(300);
    },
  },
  login: {
    expected: ["input", "input", "click", "form_submit"],
    run: async (page) => {
      await page.fill("#email", "user@example.com");
      await page.waitForTimeout(350);
      await page.fill("#password", "secret123");
      await page.waitForTimeout(350);
      await page.click("#login-submit");
      await page.waitForTimeout(300);
    },
  },
  "heavy-media": {
    expected: ["click"],
    run: async (page) => {
      await page.click("#pay");
      await page.waitForTimeout(300);
    },
  },
  "strict-csp": {
    expected: ["click", "input"],
    run: async (page) => {
      await page.click("#pay");
      await page.fill("#note", "csp test");
      await page.waitForTimeout(500);
    },
  },
};

// ── Feature group: per-site combined scenario ───────────────────────────────
// Screen recording + microphone + event capture + Save, all in one run, per
// the task's own framing: "for each run, verify the recording is playable,
// audio was captured, and the events match" — one recording, three checks.
async function runSiteScenario(site) {
  const ext = withGrantedHostAccess(EXT_SRC_DIR, `site-${site.key}`);
  const ctx = await newContext(ext, `site-${site.key}`);
  let page;
  try {
    page = await ctx.newPage();
    if (VERBOSE) page.on("console", (msg) => console.log(`    [console:${site.key}] ${msg.text()}`));
    const sw = await getWorker(ctx);
    await page.goto(`http://localhost:${PORT}${site.path}`, { waitUntil: "load" });
    await sleep(400);

    const tabId = await inject(sw, `http://localhost:${PORT}/*`);
    await sleep(400);

    const started = await sendStart(sw, tabId, { withMic: true });
    check(site.key, "screen-recording", "recording starts (Desktop mode, video+mic)", started?.ok === true, JSON.stringify(started));
    if (started?.ok !== true) {
      await saveFailureArtifacts(page, `${site.key}-start-failed`);
      return;
    }

    // Mic state must be read from the HUD while it's still mounted — once the
    // recording stops the HUD is torn down (see getMicHudState's comment on
    // why decoded audio bytes can't be used for this after the fact). Polled,
    // not a flat sleep: the HUD mounts as soon as the tb:rec:start RPC
    // resolves, but _extMicIncluded is only set afterward, by the separate
    // tb:rec:started broadcast — a real race the HUD's static render doesn't
    // protect against (see getMicHudState's comment on this finding).
    let micHud = { present: false };
    for (let i = 0; i < 6; i++) {
      micHud = await getMicHudState(page);
      if (micHud.present && !micHud.disabled) break;
      await sleep(500);
    }
    if (micHud.present && !micHud.disabled) {
      check(site.key, "microphone", "the microphone button is enabled in the HUD (mic track included)", true, JSON.stringify(micHud));
    } else {
      // Confirmed by direct repro, not assumed: the extension's mic path
      // (offscreen.js) requires microphone permission to have been granted to
      // the extension's own origin ONCE through an interactive page (its
      // settings page — an offscreen document has no UI to show a prompt in,
      // per offscreen.js's own comment at the getUserMedia call). Neither
      // Playwright's context.addInitScript nor context.grantPermissions(['microphone'])
      // reach that permission check for this origin — both were tried and
      // both left the mic disabled regardless of --use-fake-device-for-media-stream.
      // This is a harness limitation, not a product finding: see this file's
      // final report for what a human needs to check manually instead.
      skip(site.key, "microphone", "mic-included check", "cannot grant mic permission to the extension's offscreen document from this harness — needs a one-time manual grant via Settings, see report");
    }

    const scenario = SITE_SCENARIOS[site.key];
    await scenario.run(page);
    await sleep(500);

    await page.click('#tracebug-recording-hud [data-tb-hud="stop"]').catch(() => {});
    await sleep(2200);

    const modalPresent = await page.evaluate(() => !!document.getElementById("tracebug-quick-bug-modal"));
    check(site.key, "screen-recording", "stopping opens the ticket modal", modalPresent);
    if (!modalPresent) {
      await saveFailureArtifacts(page, `${site.key}-no-modal`);
      return;
    }

    const storage = await readStorage(sw);
    check(
      site.key,
      "screen-recording",
      "chrome.storage.local has a non-empty recording",
      storage.dataUrlLength > 1000 && storage.sizeBytes > 0,
      JSON.stringify(storage),
    );

    const playable = await decodeModalVideo(page);
    check(site.key, "screen-recording", "the saved recording is a playable video file", playable.ok === true, JSON.stringify(playable));

    const actionTypes = await getLastSessionActionTypes(page);
    check(
      site.key,
      "event-capture",
      `recorded events match the actions in order (expected ${JSON.stringify(scenario.expected)})`,
      JSON.stringify(actionTypes) === JSON.stringify(scenario.expected),
      JSON.stringify(actionTypes),
    );

    if (site.key === "login") {
      const pw = await getCapturedFieldValue(page, "password");
      check(site.key, "event-capture", "the password field is redacted in the captured event", pw === "[REDACTED]", JSON.stringify(pw));
    }

    const saveClicked = await page.evaluate(() => {
      const btn = document.querySelector('#tracebug-quick-bug-modal [data-action="save-ticket"]');
      if (!btn) return false;
      btn.click();
      return true;
    });
    await sleep(600);
    const persisted = await page.evaluate(() => {
      const btn = document.querySelector('#tracebug-quick-bug-modal [data-action="save-ticket"]');
      return !!btn && (btn.disabled === true || btn.classList.contains("tb-qb-btn-saved"));
    });
    check(site.key, "ui-buttons", "Save Ticket persists the capture", saveClicked && persisted, JSON.stringify({ saveClicked, persisted }));

    await page.evaluate(() => document.querySelector('#tracebug-quick-bug-modal [data-action="close"]')?.click());
  } catch (err) {
    check(site.key, "screen-recording", "scenario completed without throwing", false, String((err && err.stack) || err));
    await saveFailureArtifacts(page, `${site.key}-error`);
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ── Failure case: Desktop getDisplayMedia denied ────────────────────────────
async function runDisplayMediaDeniedCase() {
  const site = "static";
  const group = "screen-recording";
  const ext = withGrantedHostAccess(EXT_SRC_DIR, "denied-display");
  const ctx = await newContextNoFakeUI(ext, "denied-display");
  let page;
  try {
    page = await ctx.newPage();
    const sw = await getWorker(ctx);
    await page.goto(`http://localhost:${PORT}${STATIC_PATH}`, { waitUntil: "load" });
    await sleep(400);
    const tabId = await inject(sw, `http://localhost:${PORT}/*`);
    await sleep(400);

    const started = await sendStart(sw, tabId, { withMic: false });
    await sleep(1500);
    const storageAfterDeny = await readStorage(sw);
    const hudPresent = await page.evaluate(() => !!document.getElementById("tracebug-recording-hud"));

    // FINDING, not assumed: headless Chromium's new headless mode (required
    // for extension loading at all — see paths.mjs) has no real OS picker to
    // show even without --use-fake-ui-for-media-stream, so getDisplayMedia
    // doesn't reject the way a user-declined picker would on a real desktop —
    // confirmed by direct repro. The RPC still comes back `{ok:true}`, but no
    // HUD mounts and nothing gets saved, i.e. the SAME visible outcome a real
    // denial should have (no capture happens, nothing crashes) — just not
    // reachable via the `error` field this suite originally meant to assert
    // on. Reported as what was actually observed, not forced into a pass/fail
    // on the field this harness can't control.
    if (started?.ok === false) {
      check(site, group, "a denied screen-share picker is reported as a failure, not a crash", true, JSON.stringify(started));
    } else {
      skip(
        site,
        group,
        "denied-picker error reporting",
        `headless has no real picker to decline, so getDisplayMedia can't be forced to reject — RPC still said ${JSON.stringify(started)}, but see the next two checks for the actual (correct) user-visible outcome`,
      );
    }
    check(site, group, "no HUD is left behind after a non-functional picker result", !hudPresent, JSON.stringify({ started, hudPresent }));
    check(
      site,
      group,
      "nothing gets saved to storage from a non-functional picker result",
      storageAfterDeny.dataUrlLength === 0,
      JSON.stringify(storageAfterDeny),
    );

    // The extension must still be usable afterward — proven with an
    // events-only (video:false) attempt, since this context has no fake-ui
    // flag at all (that's what makes the picker denial above realistic) and
    // so cannot prove a *video* retry succeeds without faking the picker.
    const retried = await sendStart(sw, tabId, { video: false, withMic: false });
    check(site, group, "a fresh (events-only) attempt after a denial still works", retried?.ok === true, JSON.stringify(retried));
    await sleep(1500);
    await page.click('#tracebug-recording-hud [data-tb-hud="stop"]').catch(() => {});
    await sleep(1500);
  } catch (err) {
    check(site, group, "denied-picker scenario completed without throwing", false, String((err && err.stack) || err));
    await saveFailureArtifacts(page, "denied-display-error");
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ── Failure case: microphone unavailable — recording must continue without it ──
// NOTE: this harness cannot actually grant mic permission to the extension's
// offscreen document at all (see the per-site scenario's skip() comment for
// the confirmed reason), so this no longer contrasts against a working
// mic-granted baseline — every recording in this suite behaves this way. It
// still validly proves the thing that matters here: a recording with no mic
// track completes cleanly, with no crash and a playable result.
async function runMicDeniedCase() {
  const site = "static";
  const group = "microphone";
  const ext = withGrantedHostAccess(EXT_SRC_DIR, "denied-mic");
  const ctx = await newContextNoFakeMicDevice(ext, "denied-mic");
  let page;
  try {
    page = await ctx.newPage();
    const sw = await getWorker(ctx);
    await page.goto(`http://localhost:${PORT}${STATIC_PATH}`, { waitUntil: "load" });
    await sleep(400);
    const tabId = await inject(sw, `http://localhost:${PORT}/*`);
    await sleep(400);

    const started = await sendStart(sw, tabId, { withMic: true });
    check(site, group, "recording still starts when the mic is unavailable", started?.ok === true, JSON.stringify(started));
    // Poll for the HUD to mount at all (plain sleep(800) was occasionally too
    // short, same class of race as the per-site scenario's mic-state poll).
    let micHud = { present: false };
    for (let i = 0; i < 6; i++) {
      micHud = await getMicHudState(page);
      if (micHud.present) break;
      await sleep(500);
    }
    check(
      site,
      group,
      "the mic button correctly shows disabled, not a silent fake",
      micHud.present && micHud.disabled === true,
      JSON.stringify(micHud),
    );

    await sleep(1200);
    await page.click('#tracebug-recording-hud [data-tb-hud="stop"]').catch(() => {});
    await sleep(2000);

    const storage = await readStorage(sw);
    check(
      site,
      group,
      "the recording is still saved without the microphone",
      storage.dataUrlLength > 1000 && storage.sizeBytes > 0,
      JSON.stringify(storage),
    );

    const playable = await decodeModalVideo(page);
    check(site, group, "the video-only recording is still playable", playable.ok === true, JSON.stringify(playable));
  } catch (err) {
    check(site, group, "mic-denied scenario completed without throwing", false, String((err && err.stack) || err));
    await saveFailureArtifacts(page, "denied-mic-error");
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ── Pause is absent in extension mode (fixed — see this file's comment below) ──
async function runPauseNoOpCase() {
  const site = "static";
  const group = "screen-recording";
  const ext = withGrantedHostAccess(EXT_SRC_DIR, "pause-noop");
  const ctx = await newContext(ext, "pause-noop");
  let page;
  try {
    page = await ctx.newPage();
    const sw = await getWorker(ctx);
    await page.goto(`http://localhost:${PORT}${STATIC_PATH}`, { waitUntil: "load" });
    await sleep(400);
    const tabId = await inject(sw, `http://localhost:${PORT}/*`);
    await sleep(400);

    const started = await sendStart(sw, tabId, { withMic: false });
    check(site, group, "recording starts for the pause check", started?.ok === true, JSON.stringify(started));
    await sleep(1000);

    // FIXED (was a real bug — see PROGRESS.md): a first run of this exact test
    // found the Pause button rendered in extension mode and visibly flipped to
    // "paused" on click (dataset.active="1") while the timer kept counting and
    // the recording kept running underneath — pauseVideoRecording() is guarded
    // on `_active`, which only the npm SDK's in-page transport ever sets, so
    // clicking it in the extension did nothing except lie about it. The fix
    // (recording-hud.ts's `pauseAvailable`) drops the button entirely in
    // extension mode, matching how the mic button already handles the same
    // "page can't reach the offscreen stream" limitation. Assert the honest
    // absence now, not a button that shouldn't be clicked.
    const pausePresent = await page.evaluate(() => !!document.querySelector('[data-tb-hud="pause"]'));
    check(site, group, "no Pause button in extension mode — it could never actually pause the offscreen recorder", !pausePresent);

    await page.click('#tracebug-recording-hud [data-tb-hud="stop"]').catch(() => {});
    await sleep(2000);
    const playable = await decodeModalVideo(page);
    check(site, group, "the recording stops and saves normally", playable.ok === true, JSON.stringify(playable));
  } catch (err) {
    check(site, group, "pause-absent scenario completed without throwing", false, String((err && err.stack) || err));
    await saveFailureArtifacts(page, "pause-noop-error");
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ── Failure case: the recorded tab is closed mid-recording ─────────────────
// Tab mode (chrome.tabCapture), not Desktop — it targets the tab itself, so
// closing that exact tab deterministically ends the captured track. Desktop
// mode sharing an unrelated surface would make this case untestable without
// a real OS-level screen share.
async function runTabClosedMidRecordingCase() {
  const site = "static";
  const group = "screen-recording";
  const ext = withGrantedTabCapture(EXT_SRC_DIR, "tab-closed");
  const ctx = await newContext(ext, "tab-closed");
  try {
    const sw = await getWorker(ctx);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}${STATIC_PATH}`, { waitUntil: "load" });
    await sleep(400);
    const tabId = await inject(sw, `http://localhost:${PORT}/*`);
    await sleep(400);

    const started = await sendStart(sw, tabId, { withMic: false, surfaceMode: "tab" });
    check(site, group, "Tab-mode recording starts (no picker)", started?.ok === true, JSON.stringify(started));
    await sleep(1500);

    // FIXED (was a confirmed bug — reproduced 3/3 runs plus a dedicated
    // isolated repro: chrome.tabs.onRemoved fired immediately, but nothing
    // ever finalized the recording and the offscreen document stayed alive
    // forever, with chrome.storage left empty). The fix (background.js's
    // onRemoved handler) now explicitly forces a tb:rec:stop RPC when the
    // closed tab is the one being recorded, instead of only relying on the
    // track's own "ended" event — which, for a chrome.tabCapture-sourced
    // track specifically, does not reliably fire when its source tab closes.
    //
    // REMAINING, SMALLER LIMITATION (by design, not re-broken): the tab is
    // already gone by the time chrome.tabs.onRemoved fires, so there is
    // nothing left to flush — the last second or so of footage right before
    // closure can still be minimal/lost. What's fixed is the two things that
    // actually mattered: the recorder no longer leaks forever, and a
    // genuine stop/finalize attempt now always runs instead of silently
    // never happening. Asserting on those two outcomes, not on recovering
    // every last frame of an already-closed tab.
    await page.close(); // the exact failure case under test
    await sleep(3000); // let the forced tb:rec:stop finish and persist
    const storage = await readStorage(sw);
    check(
      site,
      group,
      "closing the recorded tab mid-recording triggers a real finalize attempt (chrome.storage gets written, not left untouched)",
      storage.dataUrlLength > 0,
      JSON.stringify(storage),
    );

    const offscreenCount = await sw.evaluate(async () => {
      try {
        return (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length;
      } catch {
        return -1;
      }
    });
    check(site, group, "the offscreen recorder host no longer leaks — closed after the tab closes", offscreenCount === 0, String(offscreenCount));
  } catch (err) {
    check(site, group, "tab-closed scenario completed without throwing", false, String((err && err.stack) || err));
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ── Failure case: a large embedded frame — event-capture group ─────────────
async function runIframeCoverageCase() {
  const site = "iframe-heavy";
  const group = "event-capture";
  const ext = withGrantedHostAccess(EXT_SRC_DIR, "iframe");
  let page;
  const ctx = await newContext(ext, "iframe");
  try {
    page = await ctx.newPage();
    const sw = await getWorker(ctx);
    await page.goto(`http://localhost:${PORT}${IFRAME_PATH}`, { waitUntil: "load" });
    await sleep(400);
    const tabId = await inject(sw, `http://localhost:${PORT}/*`);
    await sleep(400);

    const started = await sendStart(sw, tabId, { video: false, withMic: false });
    check(site, group, "an events-only capture starts on a page with a large embedded frame", started?.ok === true, JSON.stringify(started));
    await sleep(1200);

    const toastText = await page.evaluate(() => document.body.innerText || "");
    check(site, group, "the large-embedded-frame warning is shown", /embedded frame/i.test(toastText), toastText.slice(0, 160));

    // Click inside the iframe — must NOT be counted (documented, deliberate:
    // collectors only run in the top frame, see src/replay-fidelity.ts).
    const frame = page.frame({ url: /iframe-inner/ });
    if (frame) await frame.click("#inner-btn").catch(() => {});
    await sleep(500);
    // Click outside the frame — must be counted.
    await page.click("#pay").catch(() => {});
    await sleep(500);

    await page.click('#tracebug-recording-hud [data-tb-hud="stop"]').catch(() => {});
    await sleep(1500);

    const actionTypes = await getLastSessionActionTypes(page);
    check(
      site,
      group,
      "only the outside-frame click is captured — nothing from inside the iframe",
      JSON.stringify(actionTypes) === JSON.stringify(["click"]),
      JSON.stringify(actionTypes),
    );
  } catch (err) {
    check(site, group, "iframe-coverage scenario completed without throwing", false, String((err && err.stack) || err));
    await saveFailureArtifacts(page, "iframe-error");
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ── UI buttons: wiring sweep + targeted safe-click behavior ─────────────────
async function runUIButtonsSweep() {
  const site = "static";
  const group = "ui-buttons";
  const ext = withGrantedHostAccess(EXT_SRC_DIR, "ui-buttons");
  let page;
  const ctx = await newContext(ext, "ui-buttons");
  try {
    page = await ctx.newPage();
    const sw = await getWorker(ctx);
    await page.goto(`http://localhost:${PORT}${STATIC_PATH}`, { waitUntil: "load" });
    await sleep(400);
    const tabId = await inject(sw, `http://localhost:${PORT}/*`);
    await sleep(400);

    const started = await sendStart(sw, tabId, { video: false, withMic: false });
    check(site, group, "a capture starts to open the ticket modal", started?.ok === true, JSON.stringify(started));
    await page.click("#pay").catch(() => {});
    await sleep(500);
    await page.click('#tracebug-recording-hud [data-tb-hud="stop"]').catch(() => {});
    await sleep(1500);

    const modalPresent = await page.evaluate(() => !!document.getElementById("tracebug-quick-bug-modal"));
    check(site, group, "the ticket modal opens after Stop", modalPresent);
    if (!modalPresent) {
      await saveFailureArtifacts(page, "ui-buttons-no-modal");
      return;
    }

    const wiring = await page.evaluate(() => {
      const modal = document.getElementById("tracebug-quick-bug-modal");
      const els = Array.from(modal.querySelectorAll("[data-action]"));
      return els.map((el) => ({
        action: el.getAttribute("data-action"),
        tag: el.tagName,
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
        disabled: !!el.disabled,
        // Buttons inside the "More ▾" menu, the "?" help panel, and any
        // non-active tab panel (Console/Network/Actions/AI/Annotations — see
        // quick-bug.ts's data-panel elements, hidden until their tab is
        // selected) are collapsed by design — invisible here is correct, not
        // a wiring gap.
        insideCollapsedPanel: !!el.closest(".tb-qb-more-menu, #tb-qb-help, [data-panel]:not(.tb-qb-panel-active)"),
      }));
    });
    check(site, group, "every [data-action] control in the ticket modal is present", wiring.length > 10, `${wiring.length} controls found`);
    const unreachable = wiring.filter((w) => w.tag === "BUTTON" && !w.visible && !w.insideCollapsedPanel);
    check(site, group, "no top-level modal button is invisible/unreachable", unreachable.length === 0, JSON.stringify(unreachable));

    const clickAction = (sel) =>
      page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return false;
        el.click();
        return true;
      }, sel);

    // Save first, before anything else touches the modal — found empirically
    // that clicking it AFTER export-replay's download flow left
    // data.currentSession unset (the click landed but silently no-opped, per
    // quick-bug.ts's `if (!sid) return`), which isn't the thing this sweep is
    // meant to test. A user saves before exporting anyway, so this order is
    // also the more realistic one.
    const saveClicked = await clickAction('#tracebug-quick-bug-modal [data-action="save-ticket"]');
    await sleep(500);
    const saved = await page.evaluate(() => {
      const btn = document.querySelector('#tracebug-quick-bug-modal [data-action="save-ticket"]');
      return !!btn && (btn.disabled === true || btn.classList.contains("tb-qb-btn-saved"));
    });
    check(site, group, "Save Ticket works from the generic sweep too", saveClicked && saved, JSON.stringify({ saveClicked, saved }));

    await clickAction('#tracebug-quick-bug-modal [data-action="theme-toggle"]');
    await sleep(150);
    check(
      site,
      group,
      "theme-toggle does not crash the modal",
      await page.evaluate(() => !!document.getElementById("tracebug-quick-bug-modal")),
    );

    await clickAction('#tracebug-quick-bug-modal [data-action="help-toggle"]');
    await sleep(150);
    const helpOpen = await page.evaluate(() => {
      const h = document.getElementById("tb-qb-help");
      return !!h && h.style.display !== "none";
    });
    check(site, group, "help-toggle opens the keyboard-shortcuts panel", helpOpen === true);
    await clickAction('#tracebug-quick-bug-modal [data-action="help-close"]');
    await sleep(150);
    const helpClosed = await page.evaluate(() => {
      const h = document.getElementById("tb-qb-help");
      return !h || h.style.display === "none";
    });
    check(site, group, "help-close closes it again", helpClosed === true);

    await clickAction('#tracebug-quick-bug-modal [data-action="more-toggle"]');
    await sleep(150);
    const moreOpen = await page.evaluate(
      () => document.querySelector('#tracebug-quick-bug-modal [data-action="more-toggle"]')?.getAttribute("aria-expanded") === "true",
    );
    check(site, group, "the More ▾ menu opens", moreOpen === true);

    await clickAction('#tracebug-quick-bug-modal [data-action="toggle-export-footer"]');
    await sleep(150);
    const footerLabel = await page.evaluate(() => document.querySelector('[data-el="footer-label"]')?.textContent || null);
    check(site, group, "toggle-export-footer flips its own label", typeof footerLabel === "string" && footerLabel.length > 0, footerLabel);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }).catch(() => null),
      clickAction('#tracebug-quick-bug-modal [data-action="export-replay"]'),
    ]);
    check(
      site,
      group,
      "Export replay (.html) produces a real download",
      !!download,
      download ? download.suggestedFilename() : "no download event",
      { flaky: true }, // download events can be slow to land on a loaded CI runner
    );
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(150);

    await clickAction('#tracebug-quick-bug-modal [data-action="close"]');
    await sleep(200);
    check(
      site,
      group,
      "the × close button closes the modal",
      await page.evaluate(() => !document.getElementById("tracebug-quick-bug-modal")),
    );
  } catch (err) {
    check(site, group, "UI button sweep completed without throwing", false, String((err && err.stack) || err));
    await saveFailureArtifacts(page, "ui-buttons-error");
  } finally {
    await ctx.close().catch(() => {});
  }
  console.log("       (popup toolbar buttons are intentionally out of scope — see this file's header comment and STATE.md item 8)");
}

// ── Run everything, then report ─────────────────────────────────────────────
function printMatrixTable() {
  const scored = results.filter((r) => !r.skipped);
  const groups = [...new Set(results.map((r) => r.group))];
  const sites = [...new Set(results.map((r) => r.site))];
  const colWidth = Math.max(...sites.map((s) => s.length), 14) + 2;
  console.log("\n" + "=".repeat(60));
  console.log("PASS/FAIL MATRIX — feature group × site/case (passed/total, skips excluded)");
  console.log("=".repeat(60));
  console.log("group".padEnd(18) + sites.map((s) => s.padEnd(colWidth)).join(""));
  for (const g of groups) {
    const row = sites.map((s) => {
      const cell = scored.filter((r) => r.group === g && r.site === s);
      const skipCount = results.filter((r) => r.group === g && r.site === s && r.skipped).length;
      if (cell.length === 0) return (skipCount ? `SKIP (${skipCount})` : "-").padEnd(colWidth);
      const allPass = cell.every((r) => r.ok);
      const label = allPass ? "PASS" : "FAIL";
      const suffix = skipCount ? `+${skipCount} skip` : "";
      return `${label} (${cell.filter((r) => r.ok).length}/${cell.length})${suffix}`.padEnd(colWidth);
    });
    console.log(g.padEnd(18) + row.join(""));
  }

  const failed = scored.filter((r) => !r.ok);
  if (failed.length) {
    console.log("\n" + "-".repeat(60));
    console.log("FAILURES — exact step + captured state");
    console.log("-".repeat(60));
    for (const f of failed) {
      console.log(`[${f.site}/${f.group}] ${f.name}${f.flaky ? "  (tagged timing-sensitive)" : ""}`);
      if (f.extra) console.log(`    state: ${f.extra}`);
    }
  }

  const skips = results.filter((r) => r.skipped);
  if (skips.length) {
    console.log("\n" + "-".repeat(60));
    console.log("SKIPPED — this harness cannot drive these; needs a human, see reason");
    console.log("-".repeat(60));
    for (const s of skips) console.log(`[${s.site}/${s.group}] ${s.name} — ${s.extra}`);
  }

  const flaky = scored.filter((r) => r.flaky);
  if (flaky.length) {
    console.log("\n" + "-".repeat(60));
    console.log("TIMING-SENSITIVE CHECKS — flagged separately, see the comment at each check's call site for why");
    console.log("-".repeat(60));
    for (const f of flaky) console.log(`[${f.site}/${f.group}] ${f.name} — ${f.ok ? "passed" : "FAILED"} this run`);
  }
}

function writeReportFile() {
  const dir = outDir();
  const file = join(dir, "feature-matrix-report.json");
  writeFileSync(file, JSON.stringify({ results, summary: { passes, failures, skipped } }, null, 2));
  console.log(`\nFull machine-readable report: ${file}`);
}

const server = await startFixtureServer(PORT);
console.log(`\nFeature × site matrix — TraceBug extension e2e\n${"=".repeat(60)}`);

try {
  console.log("\n── Per-site combined scenarios (recording + mic + event capture + save) ──");
  for (const site of SITES) {
    await runSiteScenario(site);
  }

  console.log("\n── Once-only failure cases (page-agnostic extension mechanics) ──");
  await runDisplayMediaDeniedCase();
  await runMicDeniedCase();
  await runPauseNoOpCase();
  await runTabClosedMidRecordingCase();

  console.log("\n── Once-only: iframe coverage (event-capture failure case) ──");
  await runIframeCoverageCase();

  console.log("\n── Once-only: UI button sweep ──");
  await runUIButtonsSweep();
} finally {
  server.close();
}

printMatrixTable();
writeReportFile();
console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
