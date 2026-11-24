// Run: node e2e/ext-linear-connect.e2e.mjs   (needs `npm run build:ext` first)
//
// Phase 13 step 4: Linear, one-click sign-in (OAuth + PKCE through
// chrome.identity.launchWebAuthFlow) and attachments, in the in-page panel:
//   Send to Linear → panel offers Connect Linear → (sign-in popup) → teams →
//   labels / assignee / priority / project → Create → screenshots and the
//   .html report uploaded via fileUpload and linked → "Created ENG-1".
// Then: an expiring token refreshes with no secret; a refused upload still
// files the issue and says what wasn't attached; a revoked sign-in turns into
// Reconnect Linear with the choices kept; Disconnect revokes at Linear.
//
// The copy of the build under test gets three things the real one gets from
// the owner or the user: a Linear client id (still a placeholder in the
// repo), the upload origin (unconfirmed — LINEAR_UPLOAD_ORIGINS is empty), and
// `identity` granted up front (Playwright can't click a permission prompt).
// Linear itself (api.linear.app, the storage host) is stubbed with
// context.route; launchWebAuthFlow is replaced in the worker, since its
// window can't be routed.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { extensionLaunchOptions, EXT_DIST_DIR, PUBLIC_DIR, requireBuilt } from "./paths.mjs";

const EXT_SRC = requireBuilt(EXT_DIST_DIR, "run `npm run build:ext` first");
const EXT = withGrantedHostAccess(EXT_SRC, "linear-connect");
const STORE = "https://storage.googleapis.com";
{
  const api = join(EXT, "tracebug-provider-api.js");
  let src = readFileSync(api, "utf8");
  const a = "linear: TODO_OWNER_CLIENT_ID,";
  const b = "var LINEAR_UPLOAD_ORIGINS = [];";
  if (!src.includes(a) || !src.includes(b)) throw new Error("bundle markers not found — update this suite");
  src = src.replace(a, 'linear: "lin_client_E2E",').replace(b, `var LINEAR_UPLOAD_ORIGINS = ["${STORE}"];`);
  writeFileSync(api, src);
  const m = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));
  m.permissions = [...(m.permissions || []), "identity"];
  writeFileSync(join(EXT, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
}

const PORT = 4935;
const SITE = `http://localhost:${PORT}/try.html`;
const GLOB = `http://localhost:${PORT}/*`;
const ACCESS = "lin_oauth_E2E_ACCESS_0123456789abcdef0123456789abcdef";
const REFRESH = "lin_oauth_E2E_REFRESH_0123456789abcdef0123456789abcd";
const TEAM = "9c7f2a1e-1111-4222-8333-444455556666";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(PORT, r));

let failures = 0, passes = 0;
const check = (name, ok, extra = "") => {
  if (ok) passes++; else failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
};
const total = () => `${passes}/${passes + failures} checks passed`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), "tb-linear-e2e-")),
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

// ── Linear stubs ───────────────────────────────────────────────────────────
const tokenBodies = [];
const revokes = [];
const uploads = [];      // { filename, size }
const puts = [];         // { url, size, headers }
const creates = [];      // issueCreate inputs
let revoked = false;     // the grant was revoked at Linear
let refusePutFor = "";   // a filename whose PUT the store refuses
let issueN = 1;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

await ctx.route("https://api.linear.app/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  if (url.pathname === "/oauth/token") {
    const f = new URLSearchParams(req.postData() || "");
    tokenBodies.push(Object.fromEntries(f));
    if (f.get("grant_type") === "refresh_token" && revoked) return json(route, { error: "invalid_grant" }, 400);
    if (f.get("grant_type") === "authorization_code") revoked = false;
    return json(route, { access_token: ACCESS, refresh_token: REFRESH, expires_in: 86399, token_type: "Bearer", scope: "read,write" });
  }
  if (url.pathname === "/oauth/revoke") {
    revokes.push(Object.fromEntries(new URLSearchParams(req.postData() || "")));
    return route.fulfill({ status: 200, body: "" });
  }
  if (url.pathname !== "/graphql") return json(route, { error: "not found" }, 404);
  if (revoked || (req.headers()["authorization"] || "") !== `Bearer ${ACCESS}`) return json(route, { errors: [{ message: "Authentication required" }] }, 401);
  const { query, variables } = JSON.parse(req.postData() || "{}");
  const v = variables || {};
  if (query.includes("viewer")) return json(route, { data: { viewer: { name: "Ana", email: "ana@acme.test" } } });
  if (query.includes("teams(")) return json(route, { data: { teams: { nodes: [{ id: TEAM, key: "ENG", name: "Engineering" }] } } });
  if (query.includes("issueLabels")) {
    return json(route, { data: {
      team: {
        members: { nodes: [{ id: "u-ana", displayName: "ana", active: true }] },
        projects: { nodes: [{ id: "p-web", name: "Web" }] },
      },
      issueLabels: { nodes: [{ id: "l-bug", name: "Bug" }, { id: "l-ui", name: "ui" }] },
    } });
  }
  if (query.includes("fileUpload")) {
    uploads.push({ filename: v.filename, size: v.size, type: v.contentType });
    return json(route, { data: { fileUpload: { success: true, uploadFile: {
      uploadUrl: `${STORE}/linear-e2e/${uploads.length}/${encodeURIComponent(v.filename)}?X-Goog-Signature=abc`,
      assetUrl: `https://uploads.linear.app/e2e/${uploads.length}/${encodeURIComponent(v.filename)}`,
      headers: [{ key: "x-goog-content-length-range", value: `${v.size},${v.size}` }],
    } } } });
  }
  if (query.includes("issueCreate")) {
    creates.push(v.input);
    const n = issueN++;
    return json(route, { data: { issueCreate: { success: true, issue: { id: v.input.id, identifier: `ENG-${n}`, url: `https://linear.app/acme/issue/ENG-${n}` } } } });
  }
  if (query.includes("issue(id:")) return json(route, { errors: [{ message: "Entity not found: Issue" }] });
  return json(route, { data: {} });
});
await ctx.route(`${STORE}/**`, async (route) => {
  const req = route.request();
  const body = req.postDataBuffer();
  const name = decodeURIComponent(new URL(req.url()).pathname.split("/").pop());
  puts.push({ url: req.url(), method: req.method(), size: body ? body.length : 0, headers: req.headers(), name });
  if (refusePutFor && name === refusePutFor) return route.fulfill({ status: 403, body: "denied" });
  return route.fulfill({ status: 200, body: "" });
});

let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
const extId = new URL(sw.url()).host;
// Filed issues would open in a new tab and take focus from the Create window
// this suite keeps using; that behaviour is covered in ext-inpage-panel.
await sw.evaluate(() => chrome.storage.local.set({ tb_open_issue_after_create_v1: false }));
// Linear's sign-in page runs in launchWebAuthFlow's own window, which routes
// can't reach: answer it here the way Linear would — redirect back with a
// code and the same state.
await sw.evaluate(() => {
  self.__authUrls = [];
  chrome.identity.launchWebAuthFlow = async (opts) => {
    self.__authUrls.push(opts.url);
    const u = new URL(opts.url);
    return chrome.identity.getRedirectURL() + "?code=c0de_E2E&state=" + encodeURIComponent(u.searchParams.get("state"));
  };
});
const auth = () => sw.evaluate(async () => ((await chrome.storage.local.get("tb_tracker_auth_v1")).tb_tracker_auth_v1 || {}).linear || null);

async function inject(page) {
  await sw.evaluate(async (g) => {
    const [tab] = await chrome.tabs.query({ url: g });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["secret-migration.js", "content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk-ext.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, GLOB);
  await page.waitForFunction(() => !!window.__TraceBugExtensionSDK, null, { timeout: 15000 });
  await sleep(400);
  await page.evaluate(() => {
    window.__tbResults = [];
    window.addEventListener("tracebug-provider-result", (e) => window.__tbResults.push(JSON.stringify(e.detail)));
    try { window.__TraceBugExtension.startEventsCapture && window.__TraceBugExtension.startEventsCapture(); } catch (e) {}
  });
  await sleep(300);
}

async function ticket(page, title) {
  await page.click("#orderBtn");
  await sleep(400);
  // A screenshot for the ticket to carry (the shortcut alone doesn't take one here).
  const shot = await page.evaluate(() => window.__TraceBugExtension.takeScreenshot().then((s) => !!(s && s.dataUrl), (e) => "err " + e));
  if (shot !== true) console.log("note: screenshot", shot);
  await page.keyboard.press("Control+Shift+KeyB");
  await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
  await sleep(700);
  await page.fill("#tb-qb-title", title);
}

/** More ▾ → Send to Linear → the panel frame. */
async function sendToLinear(page) {
  await page.click('#tracebug-quick-bug-modal [data-action="more-toggle"]');
  await page.click('#tracebug-quick-bug-modal [data-action="linear"]');
  let frame = null;
  for (let i = 0; i < 100 && !frame; i++) {
    frame = page.frames().find((f) => f.url().includes("/create-issue.html")) || null;
    if (!frame) await sleep(150);
  }
  if (frame) await frame.waitForSelector("#panel:not([hidden])", { timeout: 15000 }).catch(() => {});
  return frame;
}

const armed = (f) => f.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 8000 }).then(() => true, () => false);

try {
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "load" });
  await sleep(300);
  await inject(page);
  await page.fill("#coupon", "SAVE20");
  await ticket(page, "Linear ticket one");

  // ══ Connect from the panel ═══════════════════════════════════════════════
  const f = await sendToLinear(page);
  check("Send to Linear opens the in-page panel", !!f);
  if (!f) throw new Error("no panel");
  check('…set to Linear, offering "Connect Linear"', (await f.inputValue("#tracker")) === "linear" &&
    (await f.isVisible("#connect")) && (await f.textContent("#connect")).trim() === "Connect Linear");
  check("…and listing what it will attach", /Attaches: .*\.png.*tracebug-report-[0-9a-f]+\.html/.test(await f.textContent("#attachNote")),
    await f.textContent("#attachNote"));

  await f.click("#connect");
  await f.waitForFunction(() => /ana@acme\.test/.test(document.getElementById("account").textContent || ""), null, { timeout: 15000 }).catch(() => {});
  check('one click → signed in: "as ana@acme.test"', /as ana@acme\.test/.test(await f.textContent("#account")));
  const authUrl = new URL((await sw.evaluate(() => self.__authUrls[0])) || "https://x/");
  check("the sign-in asked Linear with PKCE (S256) and state, no secret",
    authUrl.origin + authUrl.pathname === "https://linear.app/oauth/authorize" && authUrl.searchParams.get("code_challenge_method") === "S256" &&
    !!authUrl.searchParams.get("code_challenge") && !!authUrl.searchParams.get("state") && authUrl.searchParams.get("client_id") === "lin_client_E2E" &&
    !authUrl.searchParams.has("client_secret"), authUrl.toString().slice(0, 160));
  check("the code exchange sent the verifier and no secret",
    tokenBodies[0] && tokenBodies[0].grant_type === "authorization_code" && tokenBodies[0].code === "c0de_E2E" &&
    !!tokenBodies[0].code_verifier && !("client_secret" in tokenBodies[0]), JSON.stringify(tokenBodies[0]));
  const a1 = await auth();
  check("the token is in extension storage, with its refresh token", !!a1 && a1.tokens.accessToken === ACCESS && a1.tokens.refreshToken === REFRESH);
  check("no token in the page", !(await page.content()).includes(ACCESS) && !(await page.content()).includes(REFRESH));

  // ══ Fields → Create with attachments ═════════════════════════════════════
  await f.waitForFunction(() => document.querySelectorAll("#containerList option").length > 0, null, { timeout: 8000 });
  await f.fill("#container", TEAM);
  await f.dispatchEvent("#container", "change");
  await f.waitForSelector('button.chip[value="l-bug"]', { timeout: 8000 });
  check('team labels load as chips, "Bug" ticked by default', (await f.getAttribute('button.chip[value="l-bug"]', "aria-pressed")) === "true");
  await f.selectOption('select[data-field="assignee"]', "u-ana");
  await f.selectOption('select[data-field="priority"]', "2");
  await f.selectOption('select[data-field="project"]', "p-web");
  check("Create arms", await armed(f));
  await f.click("#send");
  await f.waitForSelector("#doneBox:not([hidden])", { timeout: 20000 }).catch(() => {});
  check('"Created ENG-1" in the panel', (await f.textContent("#issueLink")).trim() === "ENG-1");
  check("…with the files reported as attached", /2 files attached/.test(await f.textContent("#doneNote")), await f.textContent("#doneNote"));
  check("Linear prepared an upload per file, with exact sizes",
    uploads.length === 2 && uploads[0].type === "image/png" && uploads[1].type === "text/html" && uploads.every((u) => u.size > 0), JSON.stringify(uploads));
  check("the bytes went to the signed URL by PUT, size and Linear's headers intact",
    puts.length === 2 && puts.every((p, i) => p.method === "PUT" && p.size === uploads[i].size && p.headers["x-goog-content-length-range"] === `${uploads[i].size},${uploads[i].size}`),
    JSON.stringify(puts.map((p) => [p.method, p.size, p.headers["x-goog-content-length-range"]])));
  const in1 = creates[0] || {};
  check("the issue has the team, label, assignee, priority and project",
    in1.teamId === TEAM && JSON.stringify(in1.labelIds) === '["l-bug"]' && in1.assigneeId === "u-ana" && in1.priority === 2 && in1.projectId === "p-web",
    JSON.stringify({ ...in1, description: undefined }));
  check("…its description links the screenshot (inline) and the report",
    /!\[[^\]]+\.png\]\(https:\/\/uploads\.linear\.app\/e2e\/1\//.test(in1.description || "") &&
    /\[tracebug-report-[0-9a-f]+\.html\]\(https:\/\/uploads\.linear\.app\/e2e\/2\//.test(in1.description || ""));
  check("…and carries the send id as the issue id (the duplicate guard)", /^[0-9a-f-]{36}$/.test(in1.id || ""));
  const leftovers = await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith("tb_send_attach_")));
  check("the files are deleted from extension storage once the request ends", leftovers.length === 0, JSON.stringify(leftovers));
  await f.click("#cancel");
  await page.keyboard.press("Escape");
  await sleep(400);

  // ══ Refresh, and a refused upload ════════════════════════════════════════
  await sw.evaluate(async () => {
    const m = (await chrome.storage.local.get("tb_tracker_auth_v1")).tb_tracker_auth_v1;
    m.linear.tokens.expiresAt = Date.now() - 1000;
    await chrome.storage.local.set({ tb_tracker_auth_v1: m });
  });
  await ticket(page, "Linear ticket two");
  const f2 = await sendToLinear(page);
  await f2.waitForSelector('button.chip[value="l-bug"]', { timeout: 10000 }).catch(() => {});
  check("an expired token was refreshed with the client id and no secret",
    tokenBodies.some((b) => b.grant_type === "refresh_token" && b.refresh_token === REFRESH && b.client_id === "lin_client_E2E" && !("client_secret" in b)),
    JSON.stringify(tokenBodies.map((b) => b.grant_type)));
  check("the next panel starts with the last team, label, assignee, priority and project",
    (await f2.inputValue("#container")) === TEAM && (await f2.inputValue('select[data-field="assignee"]')) === "u-ana" &&
    (await f2.inputValue('select[data-field="priority"]')) === "2" && (await f2.inputValue('select[data-field="project"]')) === "p-web");
  refusePutFor = (await f2.textContent("#attachNote")).match(/tracebug-report-[0-9a-f]+\.html/)?.[0] || "";
  await armed(f2);
  await f2.click("#send");
  await f2.waitForSelector("#doneBox:not([hidden])", { timeout: 20000 }).catch(() => {});
  const note2 = await f2.textContent("#doneNote");
  check("a refused upload still files the issue", (await f2.textContent("#issueLink")).trim() === "ENG-2");
  check("…and says what wasn't attached and why", /\d+ files? attached/.test(note2) && new RegExp("Not attached: " + refusePutFor.replace(/\./g, "\\.") + " — upload refused \\(HTTP 403\\)").test(note2), note2);
  check("…linking only the file that made it", !/tracebug-report/.test(creates[1] && creates[1].description || "x") && /!\[/.test(creates[1] && creates[1].description || ""));
  refusePutFor = "";
  await f2.click("#cancel");
  await page.keyboard.press("Escape");
  await sleep(400);

  // ══ The storage host is asked for on a send with files — and declined ════
  const opt0 = await ctx.newPage();
  await opt0.goto(`chrome-extension://${extId}/options.html`);
  const status0 = await opt0.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: "tb:tracker:status" }, res)));
  const ln0 = status0.trackers.find((t) => t.id === "linear");
  check("Connect Linear doesn't ask for the storage host (only Linear's API + identity)",
    !ln0.connectPermissions.origins.some((o) => o.startsWith(STORE)) && JSON.stringify(ln0.connectPermissions.permissions) === '["identity"]',
    JSON.stringify(ln0.connectPermissions));
  check("…the storage host is reported separately, with a name for the reason line",
    JSON.stringify(ln0.uploadOrigins) === JSON.stringify([STORE + "/*"]) && ln0.uploadWhere === "Google Cloud Storage", JSON.stringify(ln0.uploadOrigins));
  await opt0.close();

  await ticket(page, "Linear ticket declined");
  const fd = await sendToLinear(page);
  await fd.waitForSelector('button.chip[value="l-bug"]', { timeout: 10000 }).catch(() => {});
  // As if the storage host had never been granted, and the user says no to Chrome's prompt.
  await fd.evaluate(() => {
    panel.current.uploadGranted = false;
    renderAttachNote("linear");
    window.__asked = [];
    chrome.permissions.request = (p, cb) => { window.__asked.push(p); if (cb) cb(false); return Promise.resolve(false); };
  });
  check('before Create the panel says why: "Linear stores attachments on Google Cloud Storage"',
    /Linear stores attachments on Google Cloud Storage/.test(await fd.textContent("#attachNote")), await fd.textContent("#attachNote"));
  const upBefore = uploads.length, putBefore = puts.length, crBefore = creates.length;
  await armed(fd);
  await fd.click("#send");
  await fd.waitForSelector("#doneBox:not([hidden])", { timeout: 20000 }).catch(() => {});
  const asked = await fd.evaluate(() => window.__asked);
  check("the first send with files asks Chrome for exactly the storage host, from the Create click",
    asked.length === 1 && JSON.stringify(asked[0].origins) === JSON.stringify([STORE + "/*"]), JSON.stringify(asked));
  check("declined → the issue is still created", (await fd.textContent("#issueLink")).trim() === `ENG-${creates.length}` && creates.length === crBefore + 1);
  check("…without asking Linear for uploads or sending any bytes", uploads.length === upBefore && puts.length === putBefore);
  check("…and says which files weren't attached and why",
    /Not attached: .*you didn't allow access to Google Cloud Storage/.test(await fd.textContent("#doneNote")), await fd.textContent("#doneNote"));
  check("…with no attachment links in the issue", !/uploads\.linear\.app/.test((creates[creates.length - 1] || {}).description || ""));
  await fd.click("#cancel");
  await page.keyboard.press("Escape");
  await sleep(400);

  // ══ Revoked at Linear → Reconnect, choices kept ══════════════════════════
  await ticket(page, "Linear ticket three");
  const f3 = await sendToLinear(page);
  await f3.waitForSelector('button.chip[value="l-bug"]', { timeout: 10000 }).catch(() => {});
  await f3.click('button.chip[value="l-ui"]');
  await f3.selectOption('select[data-field="priority"]', "1");
  revoked = true;
  await sw.evaluate(async () => {
    const m = (await chrome.storage.local.get("tb_tracker_auth_v1")).tb_tracker_auth_v1;
    m.linear.tokens.expiresAt = Date.now() + 3600e3;
    await chrome.storage.local.set({ tb_tracker_auth_v1: m });
  });
  await armed(f3);
  const createsBefore = creates.length;
  await f3.click("#send");
  await f3.waitForSelector("#connect:not([hidden])", { timeout: 15000 }).catch(() => {});
  check('a revoked sign-in shows "Reconnect Linear" in the panel', (await f3.textContent("#connect")).trim() === "Reconnect Linear",
    (await f3.textContent("#panelMsg")).trim());
  check("…nothing was filed", creates.length === createsBefore);
  await f3.click("#connect");
  await f3.waitForFunction(() => /ana@acme\.test/.test(document.getElementById("account").textContent || ""), null, { timeout: 15000 }).catch(() => {});
  await f3.waitForSelector('button.chip[value="l-ui"]', { timeout: 10000 }).catch(() => {});
  check("after reconnecting, the team and the user's changed choices are kept",
    (await f3.inputValue("#container")) === TEAM && (await f3.getAttribute('button.chip[value="l-ui"]', "aria-pressed")) === "true" &&
    (await f3.inputValue('select[data-field="priority"]')) === "1",
    `${await f3.inputValue("#container")} | l-ui ${await f3.getAttribute('button.chip[value="l-ui"]', "aria-pressed")} | priority ${await f3.inputValue('select[data-field="priority"]').catch(() => "?")}`);
  await armed(f3);
  await f3.click("#send");
  await f3.waitForSelector("#doneBox:not([hidden])", { timeout: 20000 }).catch(() => {});
  check("…and Create files it", (await f3.textContent("#issueLink")).trim() === `ENG-${creates.length}` && creates.length === createsBefore + 1);
  await f3.click("#cancel");

  // ══ Settings: the signed-in row, key path under "Use an API key instead", Disconnect revokes ══
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`);
  const acct = '.tracker-acct[data-tracker="linear"]';
  await opt.waitForFunction((a) => /ana@acme\.test/.test(document.querySelector(a + " .acct-line").textContent || ""), acct, { timeout: 5000 }).catch(() => {});
  check('settings: "Signed in as ana@acme.test" and a Default team picker',
    /Signed in as ana@acme\.test/.test(await opt.textContent(acct + " .acct-line")) && await opt.isVisible(acct + " .acct-default"));
  check('settings: the key path is "Use an API key instead", folded away',
    (await opt.textContent("#lnAdvanced summary")).trim() === "Use an API key instead" && !(await opt.evaluate(() => document.getElementById("lnAdvanced").open)));
  await opt.click(acct + " .menu-btn");
  await opt.click(acct + " .acct-disconnect");
  await opt.click("#discYes");
  await opt.waitForFunction(() => /Disconnected/.test(document.getElementById("intStatus").textContent || ""), null, { timeout: 5000 }).catch(() => {});
  await opt.waitForSelector('.add-tile[data-tracker="linear"]:not([hidden])', { timeout: 5000 }).catch(() => {});
  await opt.click('.add-tile[data-tracker="linear"] .tile-connect');
  check('settings: Connect Linear offers sign-in, with "Connect Linear" in the dialog',
    (await opt.textContent('#connectDialog [data-pane="linear"] .acct-connect')).trim() === "Connect Linear" &&
    await opt.isVisible('#connectDialog [data-pane="linear"] .acct-connect'));
  await opt.keyboard.press("Escape");
  check("Disconnect revokes the grant at Linear (refresh and access token, no secret)",
    revokes.some((r) => r.token === REFRESH && r.token_type_hint === "refresh_token") && revokes.some((r) => r.token === ACCESS) &&
    revokes.every((r) => !("client_secret" in r)), JSON.stringify(revokes));
  check("…and forgets it locally", (await auth()) === null);

  // ══ Onboarding offers Connect Linear ═════════════════════════════════════
  const welcome = await ctx.newPage();
  await welcome.goto(`chrome-extension://${extId}/welcome.html`);
  await welcome.waitForSelector("#lnBlock:not([hidden])", { timeout: 5000 }).catch(() => {});
  check("welcome page: Connect Linear next to Connect GitHub",
    (await welcome.isVisible("#lnConnect")) && (await welcome.textContent("#lnConnect")).trim() === "Connect Linear" && await welcome.isVisible("#trConnect"));
  await welcome.click("#lnConnect");
  await welcome.waitForSelector("#lnPickWrap:not([hidden])", { timeout: 15000 }).catch(() => {});
  await welcome.waitForFunction(() => document.querySelectorAll("#lnPick option").length > 1, null, { timeout: 5000 }).catch(() => {});
  check("…one click signs in and asks for the default team", (await welcome.isVisible("#lnPick")) && /Connected as ana@acme\.test/.test(await welcome.textContent("#lnStatus")),
    await welcome.textContent("#lnStatus"));
} finally {
  await ctx.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed — ${total()}` : `\nAll checks passed — ${total()}`);
process.exit(failures ? 1 : 0);
