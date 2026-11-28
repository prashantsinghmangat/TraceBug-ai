// GitHub-release demo (1.14): cuts two OBS takes into a 16:9 YouTube video and a
// 9:16 Short, timed to the narration in narration-gh-{long,short}.txt.
//   node scripts/gh.mjs            -> out/gh/video-16x9.mp4 + out/gh/timeline-16x9.json
//   node scripts/gh.mjs 9x16       -> out/gh/video-9x16.mp4 + out/gh/timeline-9x16.json
// then mix with scripts/mix.mjs (TL/VODIR/VIDEO/OUT env, see there).
//
// Takes (clips/, gitignored):
//   rec-a.mp4  connect GitHub (device code, Authorize), first issue
//   rec-b.mp4  SAVE20 capture -> GitHub tab -> issue #16 -> recording dropped into the issue
// Sensitive bits in rec-a (device code, IP address on the Authorize page) are blurred
// into rec-a-clean.mp4; the parts of rec-b with File Explorer and OBS are never used.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { chromium } from "playwright";

const HERE = fileURLToPath(new URL("..", import.meta.url)).replace(/\\/g, "/");
const CLIPS = `${HERE}clips`;
const FMT = process.argv[2] === "9x16" ? "9x16" : "16x9";
const OUT = `${HERE}out/gh/${FMT}`;
const VODIR = `${HERE}out/vo-gh-${FMT === "9x16" ? "short" : "long"}`;
const NARR = fs.readFileSync(`${HERE}narration-gh-${FMT === "9x16" ? "short" : "long"}.txt`, "utf8").trim().split(/\r?\n/);
fs.mkdirSync(OUT, { recursive: true });

const C = { bg: "#0B0D14", surface: "#141823", border: "#252A38", text: "#EEF0F5", muted: "#A8AEBE", coral: "#FF5C6C", coralLight: "#FF8590" };
const LOGO = "data:image/svg+xml;base64," + fs.readFileSync(`${HERE}../../tracebug-extension/icons/icon128.svg`).toString("base64");

const run = (args) => {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + args.join(" ").slice(0, 300));
};
const dur = (f) => +spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout.toString().trim();

// ── 1. blur pass ───────────────────────────────────────────────────────────
// Boxes are [x, y, w, h, from, to] in source pixels and seconds. Delete the
// *-clean.mp4 files after changing them.
const USER_PANEL = [1185, 348, 320, 30];   // "Signed in as <username> · GitHub App" in the ticket panel
const REPO_FIELD = [1135, 446, 210, 38];   // "<username>/tracebug-test" in the repository picker
const ISSUE_USER = [[110, 150, 175, 38], [258, 398, 210, 34], [1318, 428, 180, 34]]; // issue header, author, assignee
const CLEAN = {
  a: [
    [1130, 550, 460, 80, 13, 31],     // device code in the ticket panel
    [400, 500, 555, 90, 18.5, 23.6],  // device code typed on GitHub
    [400, 165, 570, 100, 22.5, 27.6], // "requested from <city> <IP address> on <date>"
    [300, 466, 1610, 84, 13.8, 18.7], // Device Activation: "Signed in as <username>" (window is dragged across)
    [512, 372, 330, 50, 18.5, 23.1],  // Authorize your device: "Signed in as <username>"
    [622, 366, 196, 38, 22.5, 28.2],  // Authorize: "Verify your GitHub identity (<username>)"
    [...USER_PANEL, 13, 96],
    [1142, 502, 200, 190, 33, 39.7],  // repository list (each row starts with the username)
    [...REPO_FIELD, 39.5, 96],
  ],
  b: [
    [1800, 70, 66, 48, 0, 80],        // Chrome profile picture
    [...USER_PANEL, 14.82, 31.8],
    [...REPO_FIELD, 14.82, 23.8],
    [1160, 516, 180, 36, 28.6, 31.8], // "<username>/tracebug-test #16 · Open on GitHub"
    ...[[24.4, 28.6], [40.8, 43.5], [55.8, 58.8]].flatMap(([f, t]) => ISSUE_USER.map((b) => [...b, f, t])),
  ],
};
function clean(name) {
  const out = `${CLIPS}/rec-${name}-clean.mp4`, boxes = CLEAN[name];
  if (fs.existsSync(out)) return out;
  const fc = [`[0:v]fps=30,split=${boxes.length + 1}[base]${boxes.map((_, i) => `[c${i}]`).join("")}`,
    ...boxes.map(([x, y, w, h], i) => `[c${i}]crop=${w}:${h}:${x}:${y},boxblur=${Math.min(14, Math.floor(Math.min(w, h) / 4) - 1)}:4[b${i}]`),
    ...boxes.map(([x, y, , , f, t], i) => `[${i ? `o${i - 1}` : "base"}][b${i}]overlay=${x}:${y}:enable='between(t,${f},${t})'[o${i}]`)].join(";");
  run(["-i", `${CLIPS}/rec-${name}.mp4`, "-filter_complex", fc, "-map", `[o${boxes.length - 1}]`, "-an", "-c:v", "libx264", "-crf", "14", "-preset", "fast", out]);
  return out;
}
const A = clean("a"), B = clean("b");

// ── 2. scenes ──────────────────────────────────────────────────────────────
// seg: [clip, from, to, cropX, cropY, cropW, cropH]
const W169 = { page: [240, 40, 1680, 945], ticket: [200, 100, 1520, 855], connect: [280, 0, 1420, 799], issue: [200, 130, 1500, 844], video: [150, 200, 1300, 731] };
const LONG = [
  { id: "problem", card: "problem" },
  { id: "brand", card: "brand" },
  { id: "connect", zoom: [1.14, 0.75, 0.4], chip: "Connect GitHub once", segs: [[A, 6.5, 11.6, ...W169.ticket]] },
  { id: "auth", zoom: [1.05, 0.45, 0.45], chip: "A code on GitHub's own page", segs: [[A, 13, 28.5, ...W169.connect]] },
  { id: "noserver", zoom: [1.12, 0.75, 0.45], chip: "No token · no TraceBug server", segs: [[A, 28.5, 33.2, ...W169.ticket], [A, 38, 41, ...W169.ticket]] },
  { id: "capture", zoom: [1.07, 0.55, 0.45], chip: "Capture the bug", segs: [[B, 2.5, 11.5, ...W169.page]] },
  { id: "ticket", zoom: [1.18, 0.72, 0.42], chip: "One ticket", segs: [[B, 11.6, 15.5, ...W169.ticket]] },
  { id: "file", zoom: [1.14, 0.75, 0.5], chip: "GitHub tab → Create issue", segs: [[B, 15.5, 23.5, ...W169.ticket]] },
  { id: "proof", zoom: [1.08, 0.4, 0.45], chip: "A real GitHub issue", chime: 0.5, segs: [[B, 25.9, 28.6, ...W169.issue], [B, 41, 43.3, ...W169.issue], [B, 44, 45.2, ...W169.issue]] },
  { id: "recording", zoom: [1.06, 0.5, 0.5], chip: "The recording, in the issue", segs: [[B, 29, 31.5, ...W169.ticket], [B, 56, 58.6, ...W169.issue], [B, 64.5, 71.5, ...W169.video]] },
  { id: "agent", card: "agent" },
  { id: "limits", card: "limits" },
  { id: "cta", card: "cta" },
];
const V = { hook: [480, 200, 960, 820], type: [480, 120, 960, 900], error: [880, 150, 1020, 850], ticket: [240, 170, 1420, 800], panel: [990, 200, 690, 750], issue: [235, 250, 1020, 765], steps: [240, 250, 1040, 720] };
const SHORT = [
  { id: "hook", head: "Filing a bug on GitHub<br>takes 5 minutes.", segs: [[B, 1, 4.5, ...V.hook]] },
  { id: "brand", head: "Capture the bug", segs: [[B, 4.5, 7, ...V.type], [B, 7, 11.5, ...V.error]] },
  { id: "file", head: "GitHub tab →<br><span>Create issue</span>", segs: [[B, 14.5, 23.5, ...V.panel]] },
  { id: "proof", zoom: [1.04, 0.15, 0.4], head: "A real GitHub issue", chime: 0.5, segs: [[B, 25.9, 28.6, ...V.issue], [B, 41, 43.3, ...V.issue], [B, 44, 45.2, ...V.steps]] },
  { id: "cta", card: "cta" },
];
const SCENES = FMT === "9x16" ? SHORT : LONG;
const VO_LEAD = 0.15, TAIL = 0.65;

// ── 3. overlays (Playwright → PNG) ─────────────────────────────────────────
const font = `font-family:'Segoe UI',system-ui,sans-serif;`;
const base = (w, h, body, css = "", transparent = false) => `<html><head><style>
*{margin:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;${transparent ? "background:transparent" : `background:${C.bg}`};${font}color:${C.text}}
.logo{display:flex;align-items:center;gap:18px;font-weight:700}.logo img{border-radius:18%}
.k{color:${C.coral}}code{font-family:Consolas,monospace;background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:14px 22px;color:${C.text}}
${css}</style></head><body>${body}</body></html>`;
const glow = `background:radial-gradient(ellipse at 50% 38%,rgba(255,92,108,.16),transparent 60%),${C.bg};`;

function cardHTML(kind, w, h) {
  const v = w < h, s = v ? 1.25 : 1;
  const wrap = (inner, css = "") => base(w, h, `<div class="c">${inner}</div>`,
    `.c{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 ${v ? 70 : 160}px;${glow}}${css}`);
  if (kind === "problem") return base(w, h, `<div class="c"><div class="q">You found a bug.</div><ol>
    <li>Take a screenshot</li><li>Open GitHub, pick the repo</li><li>Remember what you clicked…</li><li>Go back for the console error</li></ol></div>`,
    `.c{width:100%;height:100%;${glow}display:flex;flex-direction:column;justify-content:center;padding-left:520px}
     .q{font-size:76px;font-weight:700;margin-bottom:36px}ol{font-size:40px;color:${C.muted};line-height:1.75;padding-left:44px}li::marker{color:${C.coral};font-weight:700}`);
  if (kind === "brand") return wrap(`<div class="logo" style="font-size:${88 * s}px"><img src="${LOGO}" width="${120 * s}">TraceBug</div>
    <div class="t">A browser bug → a GitHub issue,<br>in <span class="k">two clicks</span>.</div>`, `.t{margin-top:44px;font-size:${52 * s}px;font-weight:600;line-height:1.3}`);
  if (kind === "agent") return wrap(`<div class="t">Same capture, <span class="k">for your AI agent</span></div>
    <div class="p">Export the report — Claude Code, Cursor or Windsurf read it over the local MCP server.</div>
    <code style="font-size:30px;margin-top:40px">claude mcp add -s user tracebug -- npx -y tracebug mcp</code>`,
    `.t{font-size:64px;font-weight:700}.p{margin-top:26px;font-size:34px;color:${C.muted};max-width:1200px;line-height:1.45}`);
  if (kind === "limits") return wrap(`<div class="t">Honest limits</div><ul>
    <li><b>GitHub sign-in is Chrome-only</b> for now. Firefox uses a personal access token.</li>
    <li><b>GitHub's API can't attach files</b> — copy the screenshot, download the recording.</li>
    <li><b>Linear and Slack</b> work with your own API key or webhook.</li>
    <li><b>GitHub Enterprise Server</b> isn't supported.</li></ul>`,
    `.t{font-size:64px;font-weight:700;margin-bottom:40px}ul{text-align:left;font-size:34px;color:${C.muted};line-height:1.5;list-style:none;max-width:1300px}
     li{padding:12px 0 12px 44px;position:relative}li::before{content:"";position:absolute;left:0;top:30px;width:16px;height:16px;border-radius:5px;background:${C.coral}}b{color:${C.text}}`);
  if (kind === "cta") return wrap(`<div class="logo" style="font-size:${80 * s}px"><img src="${LOGO}" width="${110 * s}">TraceBug</div>
    <div class="t">Capture it. File it. <span class="k">Done.</span></div>
    <div class="pills">${["Free", "Open source", "No backend", "Nothing uploaded"].map((p) => `<span>${p}</span>`).join("")}</div>
    <div class="u">tracebug.dev</div>`,
    `.t{margin-top:40px;font-size:${54 * s}px;font-weight:700}.pills{margin-top:40px;display:flex;flex-wrap:wrap;justify-content:center;gap:16px}
     .pills span{font-size:${28 * s}px;font-weight:600;color:#D5D9E3;background:${C.surface};border:1px solid ${C.border};border-radius:999px;padding:10px 24px}
     .u{margin-top:54px;font-size:${46 * s}px;font-weight:700;color:${C.coral}}`);
  throw new Error(kind);
}
const frameHTML = (n, text) => base(1920, 1080, `<div class="win"></div><div class="cap"><span class="n">${n}</span>${text}</div>`,
  `body{${glow}}.win{position:absolute;left:122px;top:22px;width:1676px;height:948px;border-radius:14px;background:${C.border};box-shadow:0 18px 60px rgba(0,0,0,.55)}
   .cap{position:absolute;left:0;right:0;top:988px;display:flex;align-items:center;justify-content:center;gap:16px;font-size:40px;font-weight:600}
   .n{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:14px;background:${C.coral};color:#fff;font-weight:700}`);
const vbgHTML = (head) => base(1080, 1920, `<div class="h">${head}</div><div class="box"></div>
  <div class="f"><img src="${LOGO}" width="40">tracebug.dev</div>`,
  `body{${glow}}.h{position:absolute;top:140px;left:60px;right:60px;text-align:center;font-size:76px;font-weight:800;line-height:1.15}.h span{color:${C.coral}}
   .box{position:absolute;left:0;top:400px;width:1080px;height:1180px;background:${C.surface};border-top:1px solid ${C.border};border-bottom:1px solid ${C.border}}
   .f{position:absolute;top:60px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:12px;font-size:30px;font-weight:600;color:${C.muted}}.f img{border-radius:18%}`);
const subHTML = (t) => base(1080, 220, `<div class="s">${t}</div>`,
  `.s{position:absolute;left:50px;right:50px;top:0;bottom:0;display:flex;align-items:center;justify-content:center;text-align:center;font-size:54px;font-weight:700;line-height:1.2;
   text-shadow:0 3px 14px rgba(0,0,0,.9)}`, true);

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function png(file, html, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: file, omitBackground: true });
  return file;
}

// subtitle chunks: split at punctuation, then into <= 5-word pieces
const chunks = (line) => line.split(/(?<=[.,:?!])\s+/).flatMap((p) => {
  const w = p.split(/\s+/), out = [];
  for (let i = 0; i < w.length; i += 5) out.push(w.slice(i, i + 5).join(" "));
  if (out.length > 1 && out.at(-1).split(" ").length < 2) out.splice(-2, 2, out.at(-2) + " " + out.at(-1));
  return out;
});

// Smooth eased push-in: upscale 3x first so zoompan's whole-pixel steps become
// a third of an output pixel (no visible stepping), ease in-out over the scene.
function ease([z1, fx, fy], D, FW, FH) {
  const N = Math.round(D * 30), z = `(1+${(z1 - 1).toFixed(4)}*(0.5-0.5*cos(PI*min(on/${N},1))))`;
  return `scale=${FW * 3}:${FH * 3}:flags=lanczos,zoompan=z='${z}':x='max(0,min(iw-iw/zoom,${fx}*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,${fy}*ih-ih/zoom/2))':d=1:s=${FW}x${FH}:fps=30`;
}

// ── 4. render each scene ───────────────────────────────────────────────────
const timeline = [];
let t0 = 0, step = 0;
for (const [i, sc] of SCENES.entries()) {
  const vo = i + 1, voDur = dur(`${VODIR}/l${vo}.mp3`), D = +(VO_LEAD + voDur + TAIL).toFixed(3);
  const file = `${OUT}/s${String(i).padStart(2, "0")}.mp4`;
  const args = [], fc = [];
  let n = 0;
  const W = FMT === "9x16" ? 1080 : 1920, H = FMT === "9x16" ? 1920 : 1080;
  const FW = FMT === "9x16" ? 1080 : 1664, FH = FMT === "9x16" ? 1180 : 936;

  if (sc.segs) {
    const L = sc.segs.reduce((a, s) => a + (s[2] - s[1]), 0);
    sc.segs.forEach(([clip, from, to, x, y, w, h]) => {
      args.push("-ss", String(from), "-to", String(to), "-i", clip);
      const fit = FMT === "9x16" ? `scale=1080:-2,pad=1080:1180:0:(oh-ih)/2:color=${C.surface}` : `scale=1664:936`;
      fc.push(`[${n}:v]fps=30,crop=${w}:${h}:${x}:${y},${fit},setsar=1[g${n}]`);
      n++;
    });
    const f = D / L, sp = f;
    fc.push(`${sc.segs.map((_, k) => `[g${k}]`).join("")}concat=n=${sc.segs.length}:v=1:a=0,setpts=${sp.toFixed(4)}*PTS,fps=30,tpad=stop_mode=clone:stop_duration=0.2,trim=duration=${D},setpts=PTS-STARTPTS,${ease(sc.zoom || [1.06, 0.5, 0.5], D, FW, FH)}[foot]`);
    console.log(`  ${sc.id}: footage ${(1 / f).toFixed(2)}x`);
  }

  let last;
  if (FMT === "16x9") {
    if (sc.card && !sc.segs) {
      args.push("-loop", "1", "-t", String(D), "-i", await png(`${OUT}/card-${sc.id}.png`, cardHTML(sc.card, W, H), W, H));
      fc.push(`[${n}:v]fps=30,scale=1920:1080,setsar=1,trim=duration=${D}[v]`); n++; last = "v";
    } else if (sc.card) {
      args.push("-loop", "1", "-t", String(D), "-i", await png(`${OUT}/card-${sc.id}.png`, cardHTML(sc.card, W, H), W, H));
      fc.push(`[foot][${n}:v]overlay=0:0:shortest=1[v]`); n++; last = "v";
    } else {
      step++;
      args.push("-loop", "1", "-t", String(D), "-i", await png(`${OUT}/frame-${sc.id}.png`, frameHTML(step, sc.chip), W, H));
      fc.push(`[${n}:v]fps=30,setsar=1[fr]`, `[fr][foot]overlay=128:28:shortest=1[v]`); n++; last = "v";
    }
  } else {
    if (sc.card) {
      args.push("-loop", "1", "-t", String(D), "-i", await png(`${OUT}/card-${sc.id}.png`, cardHTML(sc.card, W, H), W, H));
      fc.push(`[${n}:v]fps=30,setsar=1,trim=duration=${D}[v0]`); n++;
    } else {
      args.push("-loop", "1", "-t", String(D), "-i", await png(`${OUT}/bg-${sc.id}.png`, vbgHTML(sc.head), W, H));
      fc.push(`[${n}:v]fps=30,setsar=1[bg]`, `[bg][foot]overlay=0:400:shortest=1[v0]`); n++;
    }
    // burned-in subtitles, timed by characters across the voice line
    const parts = chunks(NARR[i]), total = parts.reduce((a, p) => a + p.length, 0);
    let ts = VO_LEAD, prev = "v0";
    for (const [k, p] of parts.entries()) {
      const te = ts + (voDur * p.length) / total;
      args.push("-loop", "1", "-t", String(D), "-i", await png(`${OUT}/sub-${i}-${k}.png`, subHTML(p), 1080, 220));
      fc.push(`[${prev}][${n}:v]overlay=0:${sc.card ? 1560 : 1595}:enable='between(t,${ts.toFixed(2)},${te.toFixed(2)})':shortest=1[v${k + 1}]`);
      prev = `v${k + 1}`; n++; ts = te;
    }
    last = prev;
  }
  // soft dip between scenes
  fc.push(`[${last}]fade=t=in:st=0:d=0.3:color=0x0B0D14,fade=t=out:st=${(D - 0.3).toFixed(3)}:d=0.3:color=0x0B0D14[fin]`);
  run([...args, "-filter_complex", fc.join(";"), "-map", "[fin]", "-t", String(D), "-r", "30",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", file]);
  timeline.push({ id: sc.id, start: +t0.toFixed(3), dur: D, vo, ...(sc.chime ? { chime: sc.chime } : {}) });
  console.log(`${sc.id.padEnd(10)} ${t0.toFixed(1)}s +${D.toFixed(1)}s`);
  t0 += D;
}
await browser.close();

fs.writeFileSync(`${OUT}/list.txt`, SCENES.map((_, i) => `file 's${String(i).padStart(2, "0")}.mp4'`).join("\n"));
run(["-f", "concat", "-safe", "0", "-i", `${OUT}/list.txt`, "-c", "copy", `${HERE}out/gh/video-${FMT}.mp4`]);
fs.writeFileSync(`${HERE}out/gh/timeline-${FMT}.json`, JSON.stringify({ total: +t0.toFixed(3), scenes: timeline }, null, 1));
console.log("done", FMT, t0.toFixed(1) + "s");
