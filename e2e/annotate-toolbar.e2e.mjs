// Run: node e2e/annotate-toolbar.e2e.mjs [--browser=chromium|firefox] [--shots=<dir>] [--verbose]
// Draw-while-recording toolbar (src/ui/annotate-toolbar.ts), driven through
// the recording HUD of an events capture on website/public/try.html with the
// page SDK. Runs in Chromium and Firefox by default. Covers: every tool by
// its number key, outlined (not filled) shapes, smooth freehand, arrow head,
// text labels, undo/redo/clear, shortcuts not firing in page inputs, the hand
// tool letting clicks through, scroll + resize, and real pixels on screen.
import { chromium, firefox } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
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
await new Promise((r) => server.listen(4179, r));

let failures = 0, passes = 0, _streaming = VERBOSE;
const _held = [];
let current = "";
const check = (name, ok, extra = "") => {
  const line = `${ok ? "PASS" : "FAIL"}  [${current}] ${name}${extra ? " — " + extra : ""}`;
  if (ok) passes++; else { failures++; _streaming = true; }
  if (!_streaming) { _held.push(line); return; }
  while (_held.length) console.log(_held.shift());
  console.log(line);
};

const TOOLS = ["pen", "rect", "ellipse", "arrow", "line", "text", "highlight", "erase"];

async function run(name) {
  current = name;
  const engine = name === "firefox" ? firefox : chromium;
  let browser;
  try { browser = await engine.launch({ headless: true }); }
  catch (e) { check("browser launches", false, String(e.message || e).split("\n")[0]); return; }
  const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  try {
    await page.goto("http://localhost:4179/try.html", { waitUntil: "load" });
    await page.waitForTimeout(1000);
    await page.click("#inPageDemoBtn");
    await page.waitForFunction(() => !!window.TraceBug);
    // Make the page scrollable so scroll behaviour is testable.
    await page.evaluate(() => { document.body.style.paddingBottom = "1600px"; });
    await page.evaluate(() => window.TraceBug.startEventsCapture());
    await page.waitForSelector("#tracebug-recording-hud");

    await page.click('#tracebug-recording-hud [data-tb-hud="annotate"]');
    await page.waitForSelector("#tracebug-annot-toolbar");
    const st = () => page.evaluate(() => {
      const bar = document.getElementById("tracebug-annot-toolbar");
      const layer = document.getElementById("tracebug-annot-layer");
      const live = document.getElementById("tracebug-annot-live");
      return {
        open: !!bar,
        tool: bar?.querySelector('[aria-pressed="true"][data-tb-annot-tool]')?.getAttribute("data-tb-annot-tool") || null,
        shapes: layer ? Array.from(layer.children).map((el) => el.getAttribute("data-tb-annot-shape")) : [],
        live: live ? live.childElementCount : -1,
        hudPressed: document.querySelector('[data-tb-hud="annotate"]')?.getAttribute("aria-pressed"),
        surfaceMode: document.getElementById("tracebug-annot-surface")?.dataset.mode,
      };
    });
    let s = await st();
    check("HUD pen opens the toolbar on the pen", s.open && s.tool === "pen" && s.hudPressed === "true", JSON.stringify(s));

    // Toolbar sits below the HUD, not on it.
    const pos = await page.evaluate(() => ({
      hud: document.getElementById("tracebug-recording-hud").getBoundingClientRect().bottom,
      bar: document.getElementById("tracebug-annot-toolbar").getBoundingClientRect().top,
    }));
    check("toolbar sits under the HUD", pos.bar >= pos.hud, JSON.stringify(pos));

    const tips = await page.$$eval("[data-tb-annot-tool]", (bs) => bs.map((b) => b.getAttribute("data-tip")));
    check("every tool has a tooltip with its name and number", tips.length === 8 && tips.every((t, i) => t && t.endsWith(`· ${i + 1}`)), tips.join(" | "));
    const badges = await page.$$eval("#tracebug-annot-toolbar .tb-an-key", (b) => b.length);
    check("no number badges printed on the buttons", badges === 0);

    const drag = async (x1, y1, x2, y2, steps = 14) => {
      await page.mouse.move(x1, y1); await page.mouse.down();
      await page.mouse.move(x2, y2, { steps }); await page.mouse.up();
      await page.waitForTimeout(60);
    };

    // Each drawing tool by its number key.
    const plan = {
      pen: async () => {
        await page.mouse.move(120, 420); await page.mouse.down();
        for (let i = 1; i <= 40; i++) await page.mouse.move(120 + i * 6, 420 + Math.sin(i / 4) * 30);
        await page.mouse.up(); await page.waitForTimeout(60);
      },
      rect: () => drag(420, 380, 620, 470),
      ellipse: () => drag(660, 380, 860, 470),
      arrow: () => drag(150, 520, 330, 470),
      line: () => drag(380, 520, 560, 500),
      highlight: () => drag(620, 520, 860, 520),
    };
    for (let i = 0; i < 7; i++) {
      const tool = TOOLS[i];
      await page.keyboard.press(`Digit${i + 1}`);
      s = await st();
      check(`key ${i + 1} selects ${tool}`, s.tool === tool && s.surfaceMode === tool, JSON.stringify(s));
      if (tool === "text") {
        await page.mouse.click(900, 420);
        await page.waitForSelector(".tb-an-text");
        await page.keyboard.type("Total is wrong 123");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(60);
      } else {
        await plan[tool]();
      }
      s = await st();
      check(`${tool} draws one committed shape`, s.shapes.at(-1) === tool && s.live === 0, JSON.stringify(s.shapes));
    }

    const detail = await page.evaluate(() => {
      const L = document.getElementById("tracebug-annot-layer");
      const q = (t) => L.querySelector(`[data-tb-annot-shape="${t}"]`);
      return {
        rectFill: q("rect").getAttribute("fill"),
        ellipseFill: q("ellipse").getAttribute("fill"),
        penCurves: (q("pen").getAttribute("d").match(/Q/g) || []).length,
        arrowParts: q("arrow").childElementCount,
        arrowHeadFill: q("arrow").children[1].getAttribute("fill"),
        text: q("text").textContent,
        highlightOpacity: q("highlight").getAttribute("stroke-opacity"),
      };
    });
    check("rectangle and ellipse are outlined, not filled", detail.rectFill === "none" && detail.ellipseFill === "none", JSON.stringify(detail));
    check("pen stroke is a smoothed curve", detail.penCurves >= 20, `Q segments: ${detail.penCurves}`);
    check("arrow has a shaft and a filled head", detail.arrowParts === 2 && detail.arrowHeadFill && detail.arrowHeadFill !== "none");
    check("text label committed", detail.text === "Total is wrong 123", detail.text);
    check("highlighter is translucent", Number(detail.highlightOpacity) < 0.6);

    // Pixels: the shapes are really painted (the layer is a 1×1 overflow-visible
    // <svg>) — this is what the screen recording and captureVisibleTab see.
    const shot = await page.screenshot();
    const px = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const at = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
      // Rect drawn 420,380 → 620,470: left edge stroke vs. its centre.
      return { edge: at(420, 425), centre: at(520, 425) };
    }, shot.toString("base64"));
    const reddish = ([r, g, b]) => r > 180 && g < 120 && b < 120;
    check("rectangle edge is painted red on screen", reddish(px.edge), JSON.stringify(px.edge));
    check("rectangle centre is not filled", !reddish(px.centre), JSON.stringify(px.centre));
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `after-${name}.png`) }); }

    // Shortcuts never fire while typing in a page field.
    await page.keyboard.press("Digit1");
    await page.evaluate(() => document.getElementById("coupon").focus());
    await page.keyboard.type("23");
    s = await st();
    const coupon = await page.$eval("#coupon", (el) => el.value);
    check("digits typed into a page input don't switch tools", s.tool === "pen" && coupon.endsWith("23"), `${s.tool} / "${coupon}"`);
    await page.evaluate(() => document.activeElement.blur());

    // Undo / redo / clear.
    const n = (await st()).shapes.length;
    await page.keyboard.press("Control+z");
    check("Ctrl+Z undoes the last shape", (await st()).shapes.length === n - 1);
    await page.keyboard.press("Control+Shift+z");
    check("Ctrl+Shift+Z redoes it", (await st()).shapes.length === n);
    await page.click('[data-tb-annot="clear"]');
    check("Clear removes every drawing", (await st()).shapes.length === 0);
    await page.click('[data-tb-annot="undo"]');
    check("Undo after Clear brings them back", (await st()).shapes.length === n);

    // Eraser (8): removes only the drawing you touch; Undo puts it back.
    await page.keyboard.press("Digit8");
    s = await st();
    check("key 8 selects the eraser", s.tool === "erase" && s.surfaceMode === "erase", JSON.stringify(s));
    const box = (shape) => page.evaluate((sh) => {
      const b = document.querySelector(`#tracebug-annot-layer [data-tb-annot-shape="${sh}"]`)?.getBoundingClientRect();
      return b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null;
    }, shape);
    const rb = await box("rect");
    await page.mouse.click(rb.x + rb.w / 2, rb.y + rb.h / 2);
    check("clicking inside an empty rectangle erases nothing", (await st()).shapes.length === n);
    await page.mouse.click(rb.x + 1, rb.y + rb.h / 2);
    s = await st();
    check("clicking a rectangle's edge erases just that rectangle", s.shapes.length === n - 1 && !s.shapes.includes("rect"), JSON.stringify(s.shapes));
    const pb = await box("pen");
    await page.mouse.move(pb.x + pb.w / 2, pb.y - 15); await page.mouse.down();
    await page.mouse.move(pb.x + pb.w / 2, pb.y + pb.h + 15, { steps: 8 }); await page.mouse.up();
    s = await st();
    check("dragging the eraser across a stroke removes it", s.shapes.length === n - 2 && !s.shapes.includes("pen"), JSON.stringify(s.shapes));
    const tb = await box("text");
    await page.mouse.click(tb.x + tb.w / 2, tb.y + tb.h / 2);
    check("the eraser removes a text label", !(await st()).shapes.includes("text"));
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+z");
    s = await st();
    check("Undo brings erased drawings back", s.shapes.length === n && ["rect", "pen", "text"].every((t) => s.shapes.includes(t)), JSON.stringify(s.shapes));
    const tips8 = await page.$eval('[data-tb-annot-tool="erase"]', (b) => b.getAttribute("data-tip"));
    check("there is no hand tool; 8 is the eraser", !(await page.$('[data-tb-annot-tool="move"]')) && /Eraser/.test(tips8), tips8);

    // Esc puts the pen down: no tool lit, the page takes clicks, drawings stay.
    await page.keyboard.press("Digit2");
    await page.keyboard.press("Escape");
    s = await st();
    const hit = await page.evaluate(() => {
      const r = document.getElementById("coupon").getBoundingClientRect();
      return document.elementFromPoint(r.left + 20, r.top + r.height / 2)?.id;
    });
    check("Esc puts the pen down: page clickable, drawings kept", s.tool === null && s.surfaceMode === "move" && hit === "coupon" && s.shapes.length === n, `${s.tool} hit=${hit}`);

    // Scroll: shapes move with the page; drawing after a scroll lands under the pointer.
    await page.keyboard.press("Digit2");
    const before = await page.evaluate(() => document.querySelector('#tracebug-annot-layer [data-tb-annot-shape="rect"]').getBoundingClientRect().top);
    const y0 = await page.evaluate(() => window.scrollY);
    await page.mouse.move(500, 300);
    await page.mouse.wheel(0, 200);
    // Wait for (smooth) scrolling to settle.
    await page.waitForFunction(() => new Promise((r) => { const a = scrollY; requestAnimationFrame(() => requestAnimationFrame(() => r(scrollY === a && a > 0))); }));
    const scrolled = (await page.evaluate(() => window.scrollY)) - y0;
    const afterTop = await page.evaluate(() => document.querySelector('#tracebug-annot-layer [data-tb-annot-shape="rect"]').getBoundingClientRect().top);
    check("mouse wheel scrolls the page while drawing", scrolled > 50, `scrollY=${scrolled}`);
    check("drawings scroll with the page", Math.abs(before - scrolled - afterTop) <= 2, `${before} → ${afterTop} (scroll ${scrolled})`);
    await drag(300, 250, 420, 330);
    const r = await page.evaluate(() => {
      const els = document.querySelectorAll('#tracebug-annot-layer [data-tb-annot-shape="rect"]');
      const b = els[els.length - 1].getBoundingClientRect();
      return { left: b.left, top: b.top };
    });
    check("a shape drawn after scrolling lands under the pointer", Math.abs(r.left - 300) <= 3 && Math.abs(r.top - 250) <= 3, JSON.stringify(r));

    // Resize: the toolbar stays on screen; drawings keep their place on the page.
    const docTop = await page.evaluate(() => {
      const el = document.querySelector('#tracebug-annot-layer [data-tb-annot-shape="rect"]');
      return el.getBoundingClientRect().top + window.scrollY;
    });
    await page.setViewportSize({ width: 820, height: 560 });
    await page.waitForTimeout(200);
    const rs = await page.evaluate(() => {
      const bar = document.getElementById("tracebug-annot-toolbar").getBoundingClientRect();
      const el = document.querySelector('#tracebug-annot-layer [data-tb-annot-shape="rect"]');
      return { barL: bar.left, barR: bar.right, vw: innerWidth, docTop: el.getBoundingClientRect().top + window.scrollY };
    });
    check("toolbar stays inside the viewport after resize", rs.barL >= 0 && rs.barR <= rs.vw, JSON.stringify(rs));
    check("drawings keep their page position after resize", Math.abs(rs.docTop - docTop) <= 2, `${docTop} → ${rs.docTop}`);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    check("the drawing layer never widens the page", scrollW);

    // The in-progress layer is the one rrweb blocks; the committed one is recorded.
    check("no stray in-progress shapes", (await st()).live === 0);

    // Close: everything goes, the HUD button resets.
    await page.click('[data-tb-annot="close"]');
    s = await st();
    const leftovers = await page.evaluate(() => ["tracebug-annot-layer", "tracebug-annot-live", "tracebug-annot-surface"].filter((id) => document.getElementById(id)));
    check("close removes the toolbar, surface and drawings", !s.open && leftovers.length === 0 && s.hudPressed === "false", leftovers.join(","));

    // Reopen remembers the last tool; stopping the capture closes it.
    await page.click('#tracebug-recording-hud [data-tb-hud="annotate"]');
    s = await st();
    check("reopening keeps the last tool", s.open && s.tool === "rect", s.tool);
    await page.click('#tracebug-recording-hud [data-tb-hud="stop"]');
    await page.waitForTimeout(400);
    check("stopping the capture closes the toolbar", !(await st()).open);
    check("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    check("run completes", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  } finally {
    await browser.close();
  }
}

for (const b of BROWSERS) await run(b);
server.close();
if (!failures) console.log(`annotate toolbar: ${passes}/${passes} checks passed (${BROWSERS.join(", ")})`);
else console.log(`annotate toolbar: ${failures} FAILED — ${passes}/${passes + failures} checks passed`);
process.exit(failures ? 1 : 0);
