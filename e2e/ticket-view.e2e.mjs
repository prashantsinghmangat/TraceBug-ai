// Run: node e2e/ticket-view.e2e.mjs [--shots=<dir>] [--verbose]
// Ticket modal readability, on website/public/try.html with the page SDK in
// the light theme:
//  - the description shows as formatted text (no raw ** or >), the raw
//    Markdown opens on click or "Edit Markdown", and edits survive the switch;
//  - the Network tab's Status column header and badge-less statuses are
//    readable (they were white-on-white in light mode).
import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SHOTS = process.argv.find((a) => a.startsWith("--shots="))?.slice(8);
const VERBOSE = process.argv.includes("--verbose");
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "website", "public");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4296, r));

let failures = 0, passes = 0, _streaming = VERBOSE;
const _held = [];
const check = (name, ok, extra = "") => {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`;
  if (ok) passes++; else { failures++; _streaming = true; }
  if (!_streaming) { _held.push(line); return; }
  while (_held.length) console.log(_held.shift());
  console.log(line);
};

// WCAG relative-luminance contrast of two CSS rgb() colours.
const contrast = (a, b) => {
  const lum = (c) => {
    const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
try {
  await page.goto("http://localhost:4296/try.html", { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.click("#inPageDemoBtn");
  await page.waitForFunction(() => !!window.TraceBug);
  await page.evaluate(() => window.TraceBug.startEventsCapture());
  await page.waitForSelector("#tracebug-recording-hud");
  await page.click("#orderBtn");
  await page.waitForTimeout(1200);
  await page.click('#tracebug-recording-hud [data-tb-hud="stop"]');
  await page.waitForSelector("#tracebug-quick-bug-modal #tb-qb-desc-view", { timeout: 15000 });

  const v = await page.evaluate(() => {
    const view = document.getElementById("tb-qb-desc-view");
    const ta = document.getElementById("tb-qb-desc");
    return { viewShown: !view.hidden, taHidden: ta.hidden, text: view.innerText, raw: ta.value, html: view.innerHTML };
  });
  check("description opens as formatted text, editor hidden", v.viewShown && v.taHidden);
  check("no raw Markdown symbols in the read view", !/\*\*/.test(v.text) && !/^>\s/m.test(v.text), v.text.slice(0, 120));
  check("bold and lists are rendered", /<strong>/.test(v.html), v.html.slice(0, 160));
  check("the raw Markdown is unchanged underneath", /\*\*/.test(v.raw));
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.locator(".tb-qb-desc-wrap").screenshot({ path: join(SHOTS, "desc-view.png") }); }

  await page.click("#tb-qb-desc-view");
  let st = await page.evaluate(() => ({ ta: !document.getElementById("tb-qb-desc").hidden, view: !document.getElementById("tb-qb-desc-view").hidden }));
  check("clicking the text does NOT start editing", !st.ta && st.view, JSON.stringify(st));
  await page.click('[data-action="desc-mode"]');
  st = await page.evaluate(() => ({ ta: !document.getElementById("tb-qb-desc").hidden, focus: document.activeElement?.id, btn: document.querySelector('[data-action="desc-mode"]').getAttribute("aria-pressed") }));
  check("Edit Markdown opens the editor, focused", st.ta && st.focus === "tb-qb-desc" && st.btn === "true", JSON.stringify(st));
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\n**Extra:** typed by the tester");
  await page.click('[data-action="desc-mode"]');
  st = await page.evaluate(() => ({ view: !document.getElementById("tb-qb-desc-view").hidden, text: document.getElementById("tb-qb-desc-view").innerText }));
  check("Done returns to the read view with the edit rendered", st.view && /Extra: typed by the tester/.test(st.text) && !/\*\*Extra/.test(st.text));
  await page.click('[data-action="desc-mode"]');
  await page.click("#tb-qb-title");
  st = await page.evaluate(() => !document.getElementById("tb-qb-desc").hidden);
  check("clicking elsewhere keeps the editor open until Done", st);
  await page.click('[data-action="desc-mode"]');

  // Info tab: essentials visible, the rest folded with a count.
  await page.evaluate(() => { localStorage.setItem("tb_e2e_demo", "1"); });
  const info = await page.evaluate(() => {
    const panel = document.querySelector('#tracebug-quick-bug-modal .tb-qb-info');
    if (!panel) return null;
    // Inside a closed <details> = folded away (Chrome keeps layout boxes there).
    const visible = (el) => !!el && !el.closest("details:not([open])");
    const labels = Array.from(panel.querySelectorAll(".tb-qb-kv")).filter(visible).map((r) => r.querySelector(".tb-qb-kv-k").textContent);
    const secs = Array.from(panel.querySelectorAll("details.tb-qb-acc")).map((d) => ({
      title: d.querySelector(".tb-qb-acc-title").textContent, hint: d.querySelector(".tb-qb-acc-hint")?.textContent || "", open: d.open,
    }));
    return { labels, secs };
  });
  check("Info tab leads with the essentials", !!info && ["URL", "Timestamp", "Browser", "OS", "Viewport"].every((l) => info.labels.includes(l)), JSON.stringify(info?.labels));
  check("environment details, gaps and storage are folded away", !!info && !info.labels.some((l) => ["Screen", "Timezone", "Session", "Not captured"].includes(l))
    && ["More environment", "What's masked or missing", "Page storage & cookies"].every((t) => info.secs.some((x) => x.title === t && !x.open)), JSON.stringify(info?.secs));
  const storageSec = info?.secs.find((x) => x.title === "Page storage & cookies");
  check("the storage section says what's inside before you open it", !!storageSec && /local|session|cookie|empty/.test(storageSec.hint), storageSec?.hint);
  if (SHOTS) await page.locator("#tracebug-quick-bug-modal .tb-qb-info").screenshot({ path: join(SHOTS, "info-tab.png") });

  // Network tab, light theme.
  await page.click('#tracebug-quick-bug-modal [data-tab="network"], #tracebug-quick-bug-modal .tb-qb-tab:has-text("Network")');
  await page.waitForSelector(".tb-qb-net-head .tb-qb-net-c-stat");
  const c = await page.evaluate(() => {
    const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const b = getComputedStyle(n).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; } return "rgb(255,255,255)"; };
    const head = document.querySelector(".tb-qb-net-head .tb-qb-net-c-stat");
    const plain = Array.from(document.querySelectorAll(".tb-qb-net-summary .tb-qb-net-c-stat")).find((e) => !/tb-qb-net-(2xx|3xx|4xx|5xx|err)/.test(e.className));
    return {
      head: [getComputedStyle(head).color, bgOf(head)],
      plain: plain ? [getComputedStyle(plain).color, bgOf(plain), plain.textContent] : null,
      theme: document.getElementById("tracebug-root")?.getAttribute("data-tb-theme"),
    };
  });
  const hc = contrast(c.head[0], c.head[1]);
  check("Status header is readable in light mode", hc >= 3, `${hc.toFixed(2)}:1 (${c.head.join(" on ")}, theme ${c.theme})`);
  if (c.plain) {
    const pc = contrast(c.plain[0], c.plain[1]);
    check(`badge-less status "${c.plain[2]}" is readable`, pc >= 3, `${pc.toFixed(2)}:1`);
  }
  if (SHOTS) await page.locator(".tb-qb-net-table").screenshot({ path: join(SHOTS, "network-light.png") });
  check("no page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  check("run completes", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
} finally {
  await browser.close();
  server.close();
}
console.log(failures === 0 ? `\nALL CHECKS PASSED — ${passes}/${passes} checks passed` : `\n${failures} CHECK(S) FAILED — ${passes}/${passes + failures} checks passed`);
process.exit(failures ? 1 : 0);
