// YouTube thumbnail (1280x720) for the GitHub demo. Needs out/thumb/issue.png, a crop of the
// blurred issue page: ffmpeg -ss 27 -i clips/rec-b-clean.mp4 -frames:v 1 f27.png, then crop=1400:470:240:255.
// Run: node scripts/thumb.mjs        ->  out/thumb/TraceBug-github-thumb.png (16:9, long video)
//      node scripts/thumb.mjs 9x16   ->  out/thumb/TraceBug-github-short-thumb.png (1080x1920, Short)
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const OUT = `${HERE}../out/thumb/`;
const b64 = (p, t) => `data:${t};base64,` + fs.readFileSync(p).toString("base64");
const LOGO = b64(`${HERE}../../../tracebug-extension/icons/icon128.svg`, "image/svg+xml");
const ISSUE = b64(`${OUT}issue.png`, "image/png");

const html = `<!doctype html><html><head><style>
*{margin:0;box-sizing:border-box}
body{width:1280px;height:720px;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif;color:#EEF0F5;
  background:radial-gradient(900px 600px at 85% 40%,rgba(255,92,108,.28),transparent 60%),#0B0D14;position:relative}
.brand{position:absolute;left:64px;top:52px;display:flex;align-items:center;gap:14px;font-size:34px;font-weight:700}
.brand img{width:52px;height:52px}
.h{position:absolute;left:60px;top:150px;font-weight:800;line-height:.98;letter-spacing:-2px}
.h .a{font-size:112px;display:flex;align-items:center;gap:22px}
.h .arrow{color:#FF5C6C}
.h .b{font-size:112px}
.pill{position:absolute;left:64px;top:560px;display:flex;gap:14px}
.pill span{font-size:40px;font-weight:700;padding:12px 26px;border-radius:999px;background:#141823;border:2px solid #252A38}
.pill .c{background:#FF5C6C;border-color:#FF5C6C;color:#0B0D14}
.card{position:absolute;left:600px;top:175px;width:760px;border-radius:18px;overflow:hidden;border:2px solid #252A38;
  box-shadow:0 30px 80px rgba(0,0,0,.6);transform:rotate(-3deg)}
.card img{display:block;width:1050px;margin-left:-6px}
.card .clip{height:380px;overflow:hidden;background:#0d1117}
.err{position:absolute;left:560px;top:128px;transform:rotate(-6deg);background:#2a1216;border:2px solid #FF5C6C;color:#ff8a96;
  font:600 26px Consolas,monospace;padding:10px 18px;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.5)}
.ok{position:absolute;right:60px;bottom:120px;background:#238636;color:#fff;font-size:34px;font-weight:700;
  padding:12px 24px;border-radius:14px;box-shadow:0 14px 36px rgba(0,0,0,.55);display:flex;gap:10px;align-items:center}
</style></head><body>
<div class="brand"><img src="${LOGO}">TraceBug</div>
<div class="h"><div class="a">Bug <span class="arrow">→</span></div><div class="b">GitHub<br>issue</div></div>
<div class="pill"><span class="c">2 clicks</span><span>Free</span></div>
<div class="card"><div class="clip"><img src="${ISSUE}"></div></div>
<div class="err">✕ TypeError</div>
<div class="ok">✓ Issue created</div>
</body></html>`;

// Short: 1080x1920. Keep the message in the middle 1080x1350, which the Shorts grid and feed crop to.
const vhtml = `<!doctype html><html><head><style>
*{margin:0;box-sizing:border-box}
body{width:1080px;height:1920px;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif;color:#EEF0F5;
  background:radial-gradient(900px 900px at 50% 62%,rgba(255,92,108,.30),transparent 62%),#0B0D14;position:relative}
.brand{position:absolute;left:0;right:0;top:330px;display:flex;justify-content:center;align-items:center;gap:18px;font-size:48px;font-weight:700}
.brand img{width:72px;height:72px}
.h{position:absolute;left:0;right:0;top:440px;text-align:center;font-weight:800;line-height:.98;letter-spacing:-3px;font-size:150px}
.h .arrow{color:#FF5C6C}
.card{position:absolute;left:70px;top:900px;width:1000px;border-radius:22px;overflow:hidden;border:3px solid #252A38;
  box-shadow:0 40px 100px rgba(0,0,0,.65);transform:rotate(-3deg)}
.card .clip{height:420px;overflow:hidden;background:#0d1117}
.card img{display:block;width:1250px;margin-left:-8px}
.err{position:absolute;left:60px;top:840px;transform:rotate(-7deg);background:#2a1216;border:3px solid #FF5C6C;color:#ff8a96;
  font:600 40px Consolas,monospace;padding:14px 26px;border-radius:16px;box-shadow:0 14px 36px rgba(0,0,0,.5)}
.ok{position:absolute;right:60px;top:1250px;background:#238636;color:#fff;font-size:50px;font-weight:700;
  padding:16px 34px;border-radius:18px;box-shadow:0 16px 40px rgba(0,0,0,.55)}
.pill{position:absolute;left:0;right:0;top:1450px;display:flex;justify-content:center;gap:20px}
.pill span{font-size:58px;font-weight:700;padding:16px 38px;border-radius:999px;background:#141823;border:3px solid #252A38}
.pill .c{background:#FF5C6C;border-color:#FF5C6C;color:#0B0D14}
</style></head><body>
<div class="brand"><img src="${LOGO}">TraceBug</div>
<div class="h">Bug <span class="arrow">→</span><br>GitHub issue</div>
<div class="card"><div class="clip"><img src="${ISSUE}"></div></div>
<div class="err">✕ TypeError</div>
<div class="ok">✓ Issue created</div>
<div class="pill"><span class="c">2 clicks</span><span>Free</span></div>
</body></html>`;

const V = process.argv[2] === "9x16";
const [w, h, file, doc] = V ? [1080, 1920, "TraceBug-github-short-thumb.png", vhtml] : [1280, 720, "TraceBug-github-thumb.png", html];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: w, height: h } });
await page.setContent(doc, { waitUntil: "load" });
await page.screenshot({ path: `${OUT}${file}` });
await browser.close();
console.log(`wrote out/thumb/${file}`);
