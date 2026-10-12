// ── Confirmation window ─────────────────────────────────────────────────────
// Phase 2b. Every tracker send, and the first AI analysis on each site, is
// confirmed here before anything leaves the browser. This window is owned by
// the extension: the page under test cannot script it, read it, or dismiss it.
//
// TWO RULES, both load-bearing:
//
// 1. Everything rendered here is PAGE-CONTROLLED TEXT inside a PRIVILEGED
//    page. It is written with textContent only — never innerHTML. The CSP
//    (script-src 'self') would stop inline script, but markup would still
//    render: a body containing <img src=x onerror=…> or an <a> pointing
//    somewhere else must appear as source, not as a rendered element.
//
// 2. The request id arrives in the URL, and nothing else does. The report text
//    is fetched over chrome.runtime messaging, so no part of it is ever in a
//    URL bar, a window title, or a history entry.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(location.search);
const ID = params.get("id") || "";

let decided = false;
let deadline = 0;
let tick = null;

/** Set text safely. Every dynamic value on this page goes through here. */
function put(id, text) {
  const el = $(id);
  if (el) el.textContent = String(text == null ? "" : text);
}

function fatal(msg) {
  document.body.innerHTML = "";
  const p = document.createElement("div");
  p.className = "fatal";
  p.textContent = msg;
  document.body.appendChild(p);
}

function send(type, payload) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(Object.assign({ type }, payload), (res) => {
        void chrome.runtime.lastError;
        resolve(res || null);
      });
    } catch { resolve(null); }
  });
}

function startCountdown(expiresAt) {
  deadline = expiresAt || 0;
  if (!deadline) return;
  const render = () => {
    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    put("countdown", left > 0 ? `Cancels automatically in ${left}s` : "Cancelled.");
    if (left <= 0) {
      if (tick) clearInterval(tick);
      // The worker's chrome.alarms timeout is the authority — it has already
      // told the page. Just make the window stop pretending it can still send.
      decided = true;
      $("send").disabled = true;
      $("cancel").disabled = true;
      setTimeout(() => window.close(), 800);
    }
  };
  render();
  tick = setInterval(render, 1000);
}

function renderWarnings(list) {
  if (!Array.isArray(list) || !list.length) return;
  const ul = $("warnList");
  list.forEach((w) => {
    const li = document.createElement("li");
    li.textContent = String(w);          // page-controlled → textContent
    ul.appendChild(li);
  });
  $("warnBox").style.display = "";
}

async function load() {
  if (!ID) { fatal("This confirmation window has no request id."); return; }

  const res = await send("tb:confirm:get", { id: ID });
  if (!res || !res.ok) {
    fatal((res && res.error) || "This request is no longer waiting for confirmation.");
    return;
  }

  const r = res.request;
  put("origin", r.origin || "an unknown page");
  put("provider", r.providerLabel || r.target || "");

  if (r.kind === "llm") {
    // First AI analysis on this site: the question is about trusting the site,
    // not about one report, so the copy and the buttons change.
    put("heading", "Allow AI analysis from this site?");
    put("destination", r.destination || "");
    $("send").textContent = "Allow";
    $("cancel").textContent = "Don't allow";
    $("titleWrap").style.display = "none";
    put("bodyLabel", "Prompt that will be sent");
  } else {
    put("heading", "Send this report?");
    put("destination", r.destination || "");
    if (r.title) {
      put("title", r.title);
    } else {
      $("titleWrap").style.display = "none";
    }
  }

  put("body", r.body || "");
  // A shortened body is labelled at the body itself as well as warned about
  // above: the label is where someone looks when they notice the text stops.
  if (r.shortened) put("bodyLabel", (r.kind === "llm" ? "Prompt that will be sent" : "Body") + " — shortened to fit");
  renderWarnings(r.warnings);
  startCountdown(r.expiresAt);

  // Cancel is focused by default: the safe answer should be the one a stray
  // Enter keypress picks.
  $("cancel").focus();
}

async function decide(approved) {
  if (decided) return;
  decided = true;
  $("send").disabled = true;
  $("cancel").disabled = true;
  if (tick) clearInterval(tick);
  put("countdown", approved ? "Sending…" : "Cancelled.");
  await send("tb:confirm:decide", { id: ID, approved: !!approved });
  window.close();
}

$("send").addEventListener("click", () => decide(true));
$("cancel").addEventListener("click", () => decide(false));

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") decide(false);
});

// Closing the window with the titlebar ✕ is a cancel. The worker also watches
// windows.onRemoved, so this is belt-and-braces for the case where the window
// is closed in a way that still runs unload handlers.
window.addEventListener("beforeunload", () => {
  if (decided) return;
  decided = true;
  try { chrome.runtime.sendMessage({ type: "tb:confirm:decide", id: ID, approved: false }); } catch {}
});

load();
