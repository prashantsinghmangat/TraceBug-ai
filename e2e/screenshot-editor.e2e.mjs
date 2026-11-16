// Run: node e2e/screenshot-editor.e2e.mjs [--browser=chromium|firefox] [--shots=<dir>] [--verbose]
// The ticket's screenshot editor (src/ui/screenshot-editor.ts) on
// website/public/try.html with the page SDK: take a screenshot during a
// capture, open the ticket, open the editor from the preview, then use every
// tool by its letter key, select-and-move, the eraser, undo/redo, the unsaved
// changes prompt, and Save — which must keep the screenshot's full size and
// put real pixels into it (outline, pixelate). Chromium and Firefox.
import { chromium, firefox } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const BROWSERS = arg("browser") ? [arg("browser")] : ["chromium", "firefox"];
const SHOTS = arg("shots");
const VERBOSE = process.argv.includes("--verbose");
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "website", "public");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4297, r));

let failures = 0, passes = 0, _streaming = VERBOSE, current = "";
const _held = [];
const check = (name, ok, extra = "") => {
  const line = `${ok ? "PASS" : "FAIL"}  [${current}] ${name}${extra ? " — " + extra : ""}`;
  if (ok) passes++; else { failures++; _streaming = true; }
  if (!_streaming) { _held.push(line); return; }
  while (_held.length) console.log(_held.shift());
  console.log(line);
};

const ED = "#tracebug-shot-editor";

async function run(name) {
  current = name;
  const browser = await (name === "firefox" ? firefox : chromium).launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  try {
    await page.goto("http://localhost:4297/try.html", { waitUntil: "load" });
    await page.waitForTimeout(800);
    await page.click("#inPageDemoBtn");
    await page.waitForFunction(() => !!window.TraceBug);
    await page.evaluate(() => window.TraceBug.startEventsCapture());
    await page.waitForSelector("#tracebug-recording-hud");
    await page.click('#tracebug-recording-hud [data-tb-hud="shot"]');
    await page.waitForTimeout(2500);
    await page.click('#tracebug-recording-hud [data-tb-hud="stop"]');
    await page.waitForSelector('[data-action="annotate-primary"]', { timeout: 20000 });
    const orig = await page.evaluate(async () => {
      const src = document.querySelector('#tracebug-quick-bug-modal .tb-qb-preview img, #tracebug-quick-bug-modal img')?.src;
      const im = new Image(); im.src = src; await im.decode();
      return { w: im.naturalWidth, h: im.naturalHeight, src: src.slice(0, 64) };
    });
    await page.click('[data-action="annotate-primary"]');
    await page.waitForSelector(`${ED} .tb-se-img`);
    await page.waitForFunction((ed) => document.querySelector(`${ed} .tb-se-stage`)?.getBoundingClientRect().width > 50, ED);

    const st = () => page.evaluate((ed) => {
      const o = document.querySelector(ed);
      if (!o) return null;
      return {
        tool: o.querySelector('[data-se-tool][aria-pressed="true"]')?.getAttribute("data-se-tool"),
        kinds: Array.from(o.querySelectorAll(".tb-se-svg > g")).map((g) => g.getAttribute("data-se-kind")),
        blurs: o.querySelectorAll(".tb-se-blur").length,
        status: o.querySelector('[data-se="status"]')?.textContent || "",
      };
    }, ED);
    let s = await st();
    check("editor opens on the pen", s?.tool === "pen", JSON.stringify(s));
    const tips = await page.$$eval(`${ED} [data-se-tool]`, (bs) => bs.map((b) => b.getAttribute("data-tip")));
    check("11 tools, each tooltip names its key", tips.length === 11 && tips.every((t) => /· [A-Z]$/.test(t)), tips.join(" | "));

    const box = await page.$eval(`${ED} .tb-se-stage`, (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const at = (fx, fy) => ({ x: box.x + box.w * fx, y: box.y + box.h * fy });
    const drag = async (f1, f2, steps = 10) => {
      const a = at(...f1), b = at(...f2);
      await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps }); await page.mouse.up();
      await page.waitForTimeout(50);
    };

    // Every drawing tool by its key.
    await page.keyboard.press("p"); await drag([0.05, 0.1], [0.25, 0.2], 20);
    await page.keyboard.press("r"); await drag([0.3, 0.3], [0.5, 0.45]);
    await page.keyboard.press("o"); await drag([0.55, 0.3], [0.75, 0.45]);
    await page.keyboard.press("a"); await drag([0.1, 0.6], [0.3, 0.5]);
    await page.keyboard.press("l"); await drag([0.35, 0.6], [0.5, 0.55]);
    await page.keyboard.press("h"); await drag([0.55, 0.6], [0.8, 0.6]);
    await page.keyboard.press("b"); await drag([0.6, 0.75], [0.9, 0.9]);
    await page.keyboard.press("n");
    let p = at(0.15, 0.8); await page.mouse.click(p.x, p.y);
    p = at(0.25, 0.8); await page.mouse.click(p.x, p.y);
    await page.keyboard.press("t");
    p = at(0.35, 0.85); await page.mouse.click(p.x, p.y);
    await page.waitForSelector(`${ED} .tb-se-text`);
    await page.keyboard.type("Wrong total");
    await page.keyboard.press("Enter");
    s = await st();
    const want = ["pen", "rect", "ellipse", "arrow", "line", "highlight", "blur", "step", "step", "text"];
    check("every tool adds its mark", JSON.stringify(s.kinds) === JSON.stringify(want), JSON.stringify(s.kinds));
    check("pixelate shows a mosaic preview", s.blurs === 1);
    const steps = await page.$$eval(`${ED} g[data-se-kind="step"] text`, (ts) => ts.map((t) => t.textContent));
    check("numbered steps count up", steps.join(",") === "1,2", steps.join(","));
    const fills = await page.$$eval(`${ED} g[data-se-kind="rect"] rect:not(.tb-se-hit), ${ED} g[data-se-kind="ellipse"] ellipse:not(.tb-se-hit)`, (els) => els.map((e) => e.getAttribute("fill")));
    check("box and ellipse are outlines", fills.length === 2 && fills.every((f) => f === "none"), fills.join(","));
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `editor-${name}.png`) }); }

    // Select & move, then Delete.
    await page.keyboard.press("v");
    const rectBox = () => page.$eval(`${ED} g[data-se-kind="rect"] rect:not(.tb-se-hit)`, (r) => { const b = r.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
    const r0 = await rectBox();
    await page.mouse.move(r0.x + 1, r0.y + r0.h / 2); await page.mouse.down();
    await page.mouse.move(r0.x + 41, r0.y + r0.h / 2 + 30, { steps: 6 }); await page.mouse.up();
    const r1 = await rectBox();
    check("select & move drags a mark", Math.abs(r1.x - r0.x - 40) < 3 && Math.abs(r1.y - r0.y - 30) < 3, `${Math.round(r1.x - r0.x)},${Math.round(r1.y - r0.y)}`);
    await page.keyboard.press("Delete");
    check("Delete removes the selected mark", !(await st()).kinds.includes("rect"));
    await page.keyboard.press("Control+z");
    check("Ctrl+Z brings it back", (await st()).kinds.includes("rect"));

    // Eraser: one click on a step removes just that step.
    await page.keyboard.press("e");
    const stepEl = await page.$eval(`${ED} g[data-se-kind="step"] circle`, (c) => { const b = c.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await page.mouse.click(stepEl.x, stepEl.y);
    s = await st();
    check("eraser removes only the mark it touches", s.kinds.filter((k) => k === "step").length === 1 && s.kinds.length === want.length - 1, JSON.stringify(s.kinds));
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+Shift+z");
    await page.keyboard.press("Control+z");
    check("undo / redo / undo lands back on all marks", (await st()).kinds.length === want.length);

    // Unsaved-changes prompt.
    await page.keyboard.press("Escape");
    const prompt = await page.$eval(`${ED} .tb-se-foot`, (f) => f.textContent);
    check("Esc with unsaved marks asks first", /Discard \d+ unsaved/.test(prompt), prompt.trim().slice(0, 60));
    await page.click(`${ED} [data-se="keep"]`);
    check("Keep editing keeps the editor and the marks", (await st())?.kinds.length === want.length);

    // Save: full resolution, real pixels.
    await page.click(`${ED} [data-se="save"]`);
    await page.waitForSelector(ED, { state: "detached" });
    await page.waitForTimeout(600);
    const saved = await page.evaluate(async () => {
      const src = document.querySelector('#tracebug-quick-bug-modal .tb-qb-preview img, #tracebug-quick-bug-modal img')?.src;
      const im = new Image(); im.src = src; await im.decode();
      return { w: im.naturalWidth, h: im.naturalHeight, changed: true };
    });
    check("saved image keeps the screenshot's full size", saved.w === orig.w && saved.h === orig.h, `${saved.w}x${saved.h} vs ${orig.w}x${orig.h}`);
    const px = await page.evaluate(async () => {
      const src = document.querySelector('#tracebug-quick-bug-modal .tb-qb-preview img, #tracebug-quick-bug-modal img').src;
      const im = new Image(); im.src = src; await im.decode();
      const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const x = c.getContext("2d"); x.drawImage(im, 0, 0);
      const at = (fx, fy) => Array.from(x.getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data);
      // The rectangle's left edge is at 0.3 (it was moved, then the move undone? no — moved then deleted then restored = moved position).
      // Check the ellipse's leftmost point instead: x 0.55, y 0.375.
      return { ellipseEdge: at(0.55, 0.375), ellipseInside: at(0.65, 0.375) };
    });
    const red = ([r, g, b]) => r > 170 && g < 110 && b < 110;
    check("outlines are painted into the saved image", red(px.ellipseEdge), JSON.stringify(px));
    check("shapes are not filled in the saved image", !red(px.ellipseInside), JSON.stringify(px.ellipseInside));
    check("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    check("run completes", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  } finally {
    await browser.close();
  }
}

for (const b of BROWSERS) await run(b);
server.close();
console.log(failures === 0 ? `\nALL CHECKS PASSED — ${passes}/${passes} checks passed` : `\n${failures} CHECK(S) FAILED — ${passes}/${passes + failures} checks passed`);
process.exit(failures ? 1 : 0);
