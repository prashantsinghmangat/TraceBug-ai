// Run: node e2e/video-cut.e2e.mjs [--verbose]
// The cut behind the ticket modal's Trim (src/ui/video-trim.ts cutVideo):
// records a 6.5 s clip in the browser (canvas + a tone), cuts 2–5 s, and
// checks the result's length, picture and sound. Runs in Firefox (Playwright)
// and in installed Google Chrome / Edge. Playwright's bundled Chromium is
// deliberately not used: it cannot encode video from a normal page (records
// 0 bytes, or crashes with the extension loaded), so it says nothing about
// real Chrome.
import { chromium, firefox } from "playwright";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "tsup";

const VERBOSE = process.argv.includes("--verbose");
let failures = 0, passes = 0, _streaming = VERBOSE;
const _held = [];
const check = (name, ok, extra = "") => {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`;
  if (ok) passes++; else { failures++; _streaming = true; }
  if (!_streaming) { _held.push(line); return; }
  while (_held.length) console.log(_held.shift());
  console.log(line);
};

const outDir = mkdtempSync(join(tmpdir(), "tb-cut-"));
await build({ entry: { trim: "src/ui/video-trim.ts" }, format: ["iife"], globalName: "TBTrim", outDir, silent: true, config: false, dts: false, sourcemap: false });
const bundle = readFileSync(join(outDir, "trim.global.js"));
// Port 4190 is on Firefox's blocked-port list; keep clear of it.
const PORT = 4294;
const server = createServer((req, res) => {
  if (req.url === "/trim.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(bundle); return; }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><meta charset="utf-8"><body><script src="/trim.js"></script></body>`);
});
await new Promise((r) => server.listen(PORT, r));

const RUNS = [
  ["firefox", firefox, { headless: true, firefoxUserPrefs: { "media.autoplay.default": 0 } }],
  ["chrome", chromium, { channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] }],
  ["edge", chromium, { channel: "msedge", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] }],
];

let ran = 0;
for (const [name, engine, opts] of RUNS) {
  let browser;
  try { browser = await engine.launch(opts); }
  catch { if (name !== "firefox") { console.log(`skip  ${name} (not installed)`); continue; } check(`[${name}] launches`, false); continue; }
  ran++;
  const page = await browser.newPage();
  let crashed = false;
  page.on("crash", () => { crashed = true; });
  try {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => !!window.TBTrim, null, { timeout: 10000 });
    const r = await Promise.race([
      page.evaluate(async () => {
        // Source: 6.5 s of changing colour plus a 440 Hz tone.
        const c = document.createElement("canvas"); c.width = 320; c.height = 240; document.body.appendChild(c);
        const cx = c.getContext("2d"); let n = 0;
        const iv = setInterval(() => { cx.fillStyle = `hsl(${(n++ * 7) % 360},80%,50%)`; cx.fillRect(0, 0, 320, 240); }, 33);
        const ac = new AudioContext(); const osc = ac.createOscillator(); const dst = ac.createMediaStreamDestination();
        osc.connect(dst); osc.start();
        const st = c.captureStream(30); st.addTrack(dst.stream.getAudioTracks()[0]);
        const rec = new MediaRecorder(st, { mimeType: "video/webm" }); const ch = [];
        rec.ondataavailable = (e) => { if (e.data.size) ch.push(e.data); }; rec.start(1000);
        await new Promise((res) => setTimeout(res, 6500)); rec.stop(); await new Promise((res) => (rec.onstop = res));
        clearInterval(iv); osc.stop();
        const src = new Blob(ch, { type: "video/webm" });

        const progress = [];
        const t0 = performance.now();
        const cut = await window.TBTrim.cutVideo(src, "video/webm", 2, 5, { onProgress: (f) => progress.push(f) });
        const ms = Math.round(performance.now() - t0);

        const v = document.createElement("video"); v.muted = true; v.src = URL.createObjectURL(cut);
        await new Promise((res) => v.addEventListener("loadedmetadata", res, { once: true }));
        if (!isFinite(v.duration)) await new Promise((res) => { v.addEventListener("seeked", res, { once: true }); v.currentTime = 1e7; });
        const dur = v.duration;
        v.currentTime = 1; await new Promise((res) => v.addEventListener("seeked", res, { once: true }));
        const k = document.createElement("canvas"); k.width = 32; k.height = 24; const kx = k.getContext("2d");
        kx.drawImage(v, 0, 0, 32, 24);
        const px = kx.getImageData(0, 0, 32, 24).data; let lum = 0;
        for (let i = 0; i < px.length; i += 4) lum += px[i] + px[i + 1] + px[i + 2];
        const rms = async (b) => {
          try {
            const oac = new OfflineAudioContext(1, 48000, 48000);
            const buf = await oac.decodeAudioData(await b.arrayBuffer());
            const d = buf.getChannelData(0); let q = 0;
            for (let i = 0; i < d.length; i++) q += d[i] * d[i];
            return Math.sqrt(q / d.length);
          } catch { return -1; }
        };
        return {
          dur, ms, size: cut.size, type: cut.type, lum,
          srcRms: await rms(src), cutRms: await rms(cut),
          progressMonotonic: progress.every((p, i) => i === 0 || p >= progress[i - 1]), lastProgress: progress.at(-1),
        };
      }),
      new Promise((res) => setTimeout(() => res("TIMEOUT"), 60000)),
    ]);
    if (crashed || typeof r !== "object") { check(`[${name}] cut completes`, false, crashed ? "page crashed" : String(r)); continue; }
    check(`[${name}] cut completes`, r.size > 1000, `${r.size} bytes, ${r.type}, ${r.ms} ms`);
    check(`[${name}] kept length matches the selection (3 s)`, Math.abs(r.dur - 3) <= 0.6, `${r.dur.toFixed(2)} s`);
    check(`[${name}] the cut has a picture`, r.lum > 1000, String(r.lum));
    if (r.srcRms > 0.01) check(`[${name}] the cut keeps the sound`, r.cutRms > r.srcRms * 0.3, `rms ${r.cutRms.toFixed(3)} vs source ${r.srcRms.toFixed(3)}`);
    else console.log(`note  [${name}] source has no decodable audio here (rms ${r.srcRms}) — sound not checked`);
    check(`[${name}] progress runs 0 → 1`, r.progressMonotonic && r.lastProgress === 1);
  } catch (e) {
    check(`[${name}] run completes`, false, String(e && e.message || e).split("\n")[0]);
  } finally {
    await browser.close();
  }
}
server.close();
if (!ran) check("at least one browser ran", false);
console.log(failures === 0 ? `\nALL CHECKS PASSED — ${passes}/${passes} checks passed` : `\n${failures} CHECK(S) FAILED — ${passes}/${passes + failures} checks passed`);
process.exit(failures ? 1 : 0);
