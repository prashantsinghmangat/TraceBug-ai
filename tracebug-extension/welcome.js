// ── Welcome page (first run) ────────────────────────────────────────────────
// Opened once by background.js on runtime.onInstalled, reason "install".
// Everything dynamic here exists because the alternative is shipping a lie:
// the version, the capture shortcut (the user can rebind or clear it), and
// where to go to rebind it (Chrome and Firefox differ).
//
// This is an extension page, not a content script, so chrome.commands and
// chrome.tabs are available directly — no message to the worker.

// Every outbound link is tagged so the welcome page is distinguishable from
// the popup and the exported report in the site's referrer data. One place,
// not sprinkled through the markup.
const UTM = "utm_source=welcome";
const PLAYGROUND_URL = `https://tracebug.dev/try.html?${UTM}`;
const FEEDBACK_URL = `https://tracebug.dev/feedback?${UTM}&area=extension&type=other`;
const GITHUB_URL = `https://github.com/prashantsinghmangat/TraceBug-ai?${UTM}`;
// Empty until tracebug.dev/teams exists. A welcome page must never ship a 404,
// so the card is simply absent rather than pointing somewhere unhelpful. Set
// this and the card appears — no other change needed.
const TEAM_GUIDE_URL = "";

/** What chrome.commands bound to our capture command. "" = nothing bound. */
// Mirrors popup.js `loadBoundShortcut`. Duplicated rather than shared because
// an extension page cannot import from popup.js, and the Firefox branch (it
// returns a promise and ignores the callback) is the part that must not drift.
function loadBoundShortcut() {
  return new Promise((resolve) => {
    try {
      if (!chrome.commands || !chrome.commands.getAll) return resolve("");
      const pick = (list) => {
        const found = (list || []).find((c) => c && c.name === "tb-quick-capture");
        return (found && found.shortcut) || "";
      };
      const maybe = chrome.commands.getAll((list) => {
        void chrome.runtime.lastError;
        resolve(pick(list));
      });
      if (maybe && typeof maybe.then === "function") {
        maybe.then((list) => resolve(pick(list)), () => resolve(""));
      }
    } catch { resolve(""); }
  });
}

/**
 * Where the user rebinds extension shortcuts. Same approach as popup.js
 * `shortcutsPageUrl`: branch on the extension URL scheme, which is the thing
 * that actually differs, never on a user-agent string.
 */
function shortcutsPageUrl() {
  let scheme = "";
  try { scheme = chrome.runtime.getURL(""); } catch {}
  return scheme.startsWith("moz-extension://") ? "about:addons" : "chrome://extensions/shortcuts";
}

const isFirefox = () => shortcutsPageUrl() === "about:addons";

/**
 * Open a browser-internal page. A plain link to chrome:// or about: is blocked
 * from an extension page, and chrome.tabs.create refuses about:addons on
 * Firefox — so on Firefox fall back to telling the user where it is, which is
 * better than a button that silently does nothing.
 */
function openShortcutsPage(fallbackEl) {
  const url = shortcutsPageUrl();
  try {
    const maybe = chrome.tabs.create({ url });
    if (maybe && typeof maybe.catch === "function") {
      maybe.catch(() => showShortcutSteps(fallbackEl));
    }
    // Chrome's callback form reports failure only via lastError.
    setTimeout(() => {
      if (chrome.runtime.lastError) showShortcutSteps(fallbackEl);
    }, 0);
  } catch {
    showShortcutSteps(fallbackEl);
  }
}

/** Text steps, for when the browser will not open its own settings page. */
function showShortcutSteps(el) {
  if (!el) return;
  el.textContent = isFirefox()
    ? "Open the menu → Add-ons and themes → the gear icon → Manage Extension Shortcuts."
    : "Open chrome://extensions/shortcuts and set a key next to TraceBug.";
  el.style.display = "";
}

/**
 * Is this macOS? From the browser, not a user-agent string — same rule as
 * shortcutsPageUrl, which branches on the extension URL scheme. Used for one
 * thing only: what the key caps are labelled.
 */
function loadIsMac() {
  return new Promise((resolve) => {
    try {
      if (!chrome.runtime || !chrome.runtime.getPlatformInfo) return resolve(false);
      const done = (info) => {
        void chrome.runtime.lastError;
        resolve(!!info && info.os === "mac");
      };
      const maybe = chrome.runtime.getPlatformInfo(done);
      if (maybe && typeof maybe.then === "function") maybe.then(done, () => resolve(false));
    } catch { resolve(false); }
  });
}

/**
 * Render "Alt+B" as separate key caps. Splits on the browser's own "+".
 *
 * `mac` relabels the Alt cap with the symbol actually printed on a Mac
 * keyboard. Display only — the binding itself is whatever the browser
 * reported, and is never rewritten here.
 */
function renderKeys(container, shortcut, mac) {
  container.textContent = "";
  const parts = shortcut.split("+").map((p) => p.trim()).filter(Boolean);
  parts.forEach((part, i) => {
    if (i > 0) {
      const plus = document.createElement("span");
      plus.className = "keys-plus";
      plus.textContent = "+";
      container.appendChild(plus);
    }
    const kbd = document.createElement("kbd");
    kbd.textContent = mac && part === "Alt" ? "⌥" : part;
    container.appendChild(kbd);
  });
  const link = document.createElement("a");
  link.className = "keys-link";
  link.href = "#";
  link.textContent = "Change shortcut";
  container.appendChild(link);
  return link;
}

/** Select the command, for when the clipboard is refused. */
function selectCommand(el) {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {}
}

/**
 * Copy `npx tracebug mcp`. The clipboard needs a user gesture, which the click
 * is — but an extension page can still be refused it. When that happens the
 * text is selected instead, rather than the button claiming a copy that never
 * happened.
 */
function wireCopy() {
  const btn = document.getElementById("copyMcp");
  const cmd = document.getElementById("mcpCmd");
  if (!btn || !cmd) return;

  let timer = 0;
  const flash = (label, copied) => {
    btn.textContent = label;
    btn.classList.toggle("copied", copied);
    clearTimeout(timer);
    timer = setTimeout(() => {
      btn.textContent = "Copy";
      btn.classList.remove("copied");
    }, 1600);
  };

  btn.addEventListener("click", () => {
    const text = cmd.textContent || "";
    let write = null;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        write = navigator.clipboard.writeText(text);
      }
    } catch {}
    if (write && typeof write.then === "function") {
      write.then(
        () => flash("Copied", true),
        () => { selectCommand(cmd); flash("Select and copy", false); },
      );
    } else {
      selectCommand(cmd);
      flash("Select and copy", false);
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  // Version — from the manifest, so it cannot disagree with the build.
  try {
    const v = chrome.runtime.getManifest().version;
    const el = document.getElementById("version");
    if (el && v) el.textContent = "v" + v;
  } catch {}

  document.getElementById("playground").href = PLAYGROUND_URL;
  document.getElementById("github").href = GITHUB_URL;
  document.getElementById("feedback").href = FEEDBACK_URL;

  wireCopy();

  // Step 1 — Firefox arranges the same three clicks differently, so the
  // Chrome wording ("then the pin next to TraceBug") does not describe what
  // the user is looking at.
  if (isFirefox()) {
    const how = document.getElementById("pinHow");
    if (how) how.textContent = "Click the puzzle-piece icon, open TraceBug's menu, then Pin to Toolbar.";
  }

  // The team card, if there is anywhere real to send people. See TEAM_GUIDE_URL.
  if (TEAM_GUIDE_URL) {
    const cards = document.querySelector(".cards");
    const card = document.createElement("div");
    card.className = "card";
    const t = document.createElement("div");
    t.className = "card-t";
    t.textContent = "Rolling this out to a team?";
    const l = document.createElement("p");
    l.className = "card-l";
    l.textContent = "Setup tips for QA leads.";
    const a = document.createElement("a");
    a.href = TEAM_GUIDE_URL;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Team setup guide →";
    card.append(t, l, a);
    cards.appendChild(card);
  }

  // Step 3: whichever state is true. A hardcoded key would be wrong for
  // anyone who rebound it, and wrong for everyone on a browser that refused
  // the default binding.
  const [bound, mac] = await Promise.all([loadBoundShortcut(), loadIsMac()]);
  const keysBound = document.getElementById("keysBound");
  const keysNone = document.getElementById("keysNone");
  const steps = document.createElement("div");
  steps.className = "keys-none";
  steps.style.display = "none";
  steps.style.marginTop = "8px";

  if (bound) {
    keysBound.style.display = "";
    const link = renderKeys(keysBound, bound, mac);
    keysBound.parentElement.appendChild(steps);
    link.addEventListener("click", (e) => { e.preventDefault(); openShortcutsPage(steps); });
  } else {
    keysNone.style.display = "";
    keysNone.appendChild(steps);
    document.getElementById("setShortcut").addEventListener("click", (e) => {
      e.preventDefault();
      openShortcutsPage(steps);
    });
  }
});
