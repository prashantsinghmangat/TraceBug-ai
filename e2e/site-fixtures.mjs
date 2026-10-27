// ── Shared site fixtures for the feature/site matrix ────────────────────────
// Five local pages standing in for the real-world categories a bug-capture
// tool has to work on: static content, a client-routed SPA (also covers
// dynamic/late-added content), a login form, a heavy-media page, and a page
// with a restrictive CSP. Local and deterministic on purpose — the project's
// existing e2e suite already prefers local HTTP fixtures over live third-party
// sites for anything meant to run reliably in CI (see e2e/ext-events-capture.e2e.mjs,
// e2e/ext-redaction.e2e.mjs, etc.); the three live-site specs that DO exist
// (ext-player-csp, ext-style-nonce-page, ext-trusted-types-page) are narrow,
// single-purpose drift checks, not a pattern to extend to a whole matrix.
//
// A sixth fixture, IFRAME_PATH, is not part of SITES — it is a dedicated
// failure-case fixture for the event-capture group (replay-fidelity.ts's
// "large embedded frame" warning), not a general-purpose site archetype.
import { createServer } from "node:http";

export const STATIC_PATH = "/static";
export const SPA_PATH = "/spa";
export const LOGIN_PATH = "/login";
export const HEAVY_MEDIA_PATH = "/heavy-media";
export const STRICT_CSP_PATH = "/strict-csp";
export const IFRAME_PATH = "/iframe-heavy";
export const IFRAME_INNER_PATH = "/iframe-inner";

/** The 5-site matrix. `csp` carries extra response headers for that one route. */
export const SITES = [
  { key: "static", label: "Static content", path: STATIC_PATH },
  { key: "spa", label: "Single-page app", path: SPA_PATH },
  { key: "login", label: "Login form", path: LOGIN_PATH },
  { key: "heavy-media", label: "Heavy media", path: HEAVY_MEDIA_PATH },
  { key: "strict-csp", label: "Restrictive CSP", path: STRICT_CSP_PATH },
];

// A single nonce for the strict-CSP page's own inline script/style — proves
// the page's OWN inline content still needs it, while TraceBug's extension
// injection (a separate origin/privilege, confirmed exempt from page CSP in
// background.js's injectBridge()/injectPageWorld()) needs no nonce at all.
const CSP_NONCE = "e2e-fixture-nonce-abc123";

const STATIC_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Static fixture</title></head>
<body>
  <h1>Static content site</h1>
  <p>Plain HTML, no client-side framework.</p>
  <button id="pay">Pay now</button>
  <a id="more-info" href="#details">More info</a>
  <div id="details">Order details go here.</div>
  <input id="note" type="text" placeholder="Add a note" />
</body></html>`;

const SPA_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SPA fixture</title></head>
<body>
  <nav>
    <a id="nav-products" href="/spa/products">Products</a>
    <a id="nav-cart" href="/spa/cart">Cart</a>
  </nav>
  <div id="view">Home</div>
  <div id="dynamic-slot"></div>
  <script>
    function render(path) { document.getElementById("view").textContent = path; }
    document.getElementById("nav-products").addEventListener("click", function (e) {
      e.preventDefault();
      history.pushState(null, "", "/spa/products");
      render("/spa/products");
    });
    document.getElementById("nav-cart").addEventListener("click", function (e) {
      e.preventDefault();
      history.pushState(null, "", "/spa/cart");
      render("/spa/cart");
    });
    window.addEventListener("popstate", function () { render(location.pathname); });
    // Content that does not exist at capture-start — a real regression target
    // for "does click capture work on elements added after injection".
    setTimeout(function () {
      var btn = document.createElement("button");
      btn.id = "dyn-btn";
      btn.textContent = "Dynamically added";
      document.getElementById("dynamic-slot").appendChild(btn);
    }, 500);
  </script>
</body></html>`;

const LOGIN_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Login fixture</title></head>
<body>
  <h1>Sign in</h1>
  <form id="login-form">
    <input id="email" name="email" type="email" placeholder="Email" />
    <input id="password" name="password" type="password" placeholder="Password" />
    <button id="login-submit" type="submit">Log in</button>
  </form>
  <div id="login-result"></div>
  <script>
    document.getElementById("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      document.getElementById("login-result").textContent = "logged in";
    });
  </script>
</body></html>`;

// Heavy visually, light in bytes: a busy canvas (continuous redraw) plus many
// inline-SVG "images" rather than a real video asset, so the fixture stays
// self-contained and fast to serve.
const HEAVY_MEDIA_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Heavy media fixture</title></head>
<body>
  <h1>Heavy media page</h1>
  <canvas id="fx" width="800" height="400"></canvas>
  <div id="gallery"></div>
  <button id="pay">Pay now</button>
  <script>
    var ctx = document.getElementById("fx").getContext("2d");
    var n = 0;
    setInterval(function () {
      n++;
      ctx.fillStyle = "hsl(" + (n % 360) + ",70%,50%)";
      ctx.fillRect(0, 0, 800, 400);
      ctx.fillStyle = "#fff";
      ctx.fillRect((n * 7) % 760, (n * 5) % 360, 40, 40);
    }, 50);
    var gallery = document.getElementById("gallery");
    for (var i = 0; i < 24; i++) {
      var img = document.createElement("img");
      img.width = 64; img.height = 64;
      img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%236366F1'/%3E%3C/svg%3E";
      gallery.appendChild(img);
    }
  </script>
</body></html>`;

const STRICT_CSP_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Strict CSP fixture</title></head>
<body>
  <h1>Restrictive CSP page</h1>
  <button id="pay">Pay now</button>
  <input id="note" type="text" placeholder="Add a note" />
  <script nonce="${CSP_NONCE}">
    document.getElementById("pay").addEventListener("click", function () {
      document.title = "Paid";
    });
  </script>
</body></html>`;

const IFRAME_INNER_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Iframe inner</title></head>
<body><button id="inner-btn">Inner button</button></body></html>`;

const IFRAME_OUTER_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Iframe-heavy fixture</title></head>
<body style="margin:0">
  <h1 style="margin:4px">Page with a large embedded frame</h1>
  <button id="pay">Pay now (outside the frame)</button>
  <iframe id="big-frame" src="${IFRAME_INNER_PATH}" style="width:95vw;height:85vh;border:1px solid #ccc"></iframe>
</body></html>`;

/**
 * Serve all fixtures from one HTTP server on `port`. Returns the server;
 * caller is responsible for `server.close()`.
 */
export function startFixtureServer(port) {
  const server = createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    if (url === STRICT_CSP_PATH) {
      res.writeHead(200, {
        "content-type": "text/html",
        // require-trusted-types-for + a nonce-gated script/style-src, no
        // unsafe-inline anywhere — the same shape already proven fixable in
        // e2e/ext-trusted-types-page.e2e.mjs and e2e/ext-style-nonce-page.e2e.mjs,
        // folded into one fixture for this matrix.
        "content-security-policy":
          `default-src 'self'; script-src 'self' 'nonce-${CSP_NONCE}'; ` +
          `style-src 'self' 'nonce-${CSP_NONCE}'; require-trusted-types-for 'script'`,
      });
      res.end(STRICT_CSP_HTML);
      return;
    }
    if (url === IFRAME_PATH) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(IFRAME_OUTER_HTML);
      return;
    }
    if (url === IFRAME_INNER_PATH) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(IFRAME_INNER_HTML);
      return;
    }
    if (url === SPA_PATH || url.startsWith(SPA_PATH + "/")) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(SPA_HTML);
      return;
    }
    if (url === LOGIN_PATH) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(LOGIN_HTML);
      return;
    }
    if (url === HEAVY_MEDIA_PATH) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(HEAVY_MEDIA_HTML);
      return;
    }
    // STATIC_PATH and anything else (e.g. "/") fall back to the static page —
    // several checks navigate a tab-mode recording across "/" and a named path.
    res.writeHead(200, { "content-type": "text/html" });
    res.end(STATIC_HTML);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
