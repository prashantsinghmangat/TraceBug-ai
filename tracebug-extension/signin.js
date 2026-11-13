// ── Site Audit sign-in (ADR 009, docs/launch/sign-in-gate-plan.md) ─────────
// Email → 6-digit code → verified. Stores only { email, userId, verifiedAt } in
// chrome.storage.local (tb_audit_gate_v1.account); background.js's auditPermit
// reads it. If tracebug.dev / Supabase can't be reached, audits are opened for
// an hour (graceUntil) — a sign-in outage must never block the product.
// ?mode=delete deletes the account (same email + code proof).

"use strict";

const GATE_KEY = "tb_audit_gate_v1";
const ENDPOINT_KEY = "tracebug_cloud_endpoint";
const DEFAULT_ENDPOINT = "https://tracebug.dev";
const GRACE_MS = 60 * 60 * 1000;
const RESEND_AFTER_MS = 30 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const $ = (id) => document.getElementById(id);
let endpoint = DEFAULT_ENDPOINT;
let email = "";
let intent = new URLSearchParams(location.search).get("mode") === "delete" ? "delete" : "signin";
let resendTimer = 0;

applyTheme();

async function readGate() {
  try { return (await chrome.storage.local.get(GATE_KEY))[GATE_KEY] || {}; } catch { return {}; }
}
async function writeGate(patch) {
  const g = await readGate();
  await chrome.storage.local.set({ [GATE_KEY]: { ...g, ...patch } });
}

function applyTheme() {
  try {
    const v = localStorage.getItem("tracebug_popup_theme");
    if (v === "light" || v === "dark") document.documentElement.setAttribute("data-theme", v);
  } catch {}
}

function show(step) {
  for (const id of ["stepEmail", "stepCode", "stepDone"]) $(id).hidden = id !== step;
  const focus = step === "stepEmail" ? $("email") : step === "stepCode" ? $("code") : null;
  if (focus) focus.focus();
}

function msg(id, text, isErr) {
  const el = $(id);
  el.textContent = text || "";
  el.classList.toggle("err", !!isErr);
}

/** POST to tracebug.dev. Resolves { status, body }; status 0 = network failure. */
async function post(path, body) {
  try {
    const res = await fetch(`${endpoint}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch {}
    return { status: res.status, body: data };
  } catch {
    return { status: 0, body: {} };
  }
}

/** Sign-in unreachable: open audits for an hour and say so plainly. */
async function failOpen(msgId) {
  await writeGate({ graceUntil: Date.now() + GRACE_MS });
  msg(msgId, "We couldn't reach TraceBug sign-in. Site Audit stays open for the next hour — go back to your tab and press Re-scan. Please try signing in again later.", false);
}

function startResendTimer() {
  $("resend").disabled = true;
  clearTimeout(resendTimer);
  resendTimer = setTimeout(() => { $("resend").disabled = false; }, RESEND_AFTER_MS);
}

async function sendCode() {
  const btn = $("sendCode");
  btn.disabled = true;
  btn.textContent = "Sending…";
  msg("emailMsg", "");
  const r = await post("/api/ext/otp/start", { email });
  btn.disabled = false;
  btn.textContent = "Email me a code";
  if (r.status === 200) {
    $("sentTo").textContent = email;
    $("code").value = "";
    msg("codeMsg", "");
    show("stepCode");
    startResendTimer();
    return true;
  }
  if (r.status === 400) msg("emailMsg", "That doesn't look like an email address.", true);
  else if (r.status === 429) msg("emailMsg", "Too many tries from here. Wait a few minutes and try again.", true);
  else if (intent === "delete") msg("emailMsg", "We couldn't reach TraceBug right now. Please try again later.", true);
  else await failOpen("emailMsg");
  return false;
}

async function verify() {
  const code = $("code").value.replace(/\s+/g, "");
  if (!/^\d{6,10}$/.test(code)) { msg("codeMsg", "Enter the code from the email (6 digits).", true); return; }
  const btn = $("verify");
  btn.disabled = true;
  btn.textContent = "Checking…";
  msg("codeMsg", "");
  const r = await post("/api/ext/otp/verify", { email, code, intent, marketing: intent === "signin" && $("marketing").checked });
  btn.disabled = false;
  btn.textContent = "Continue";
  if (r.status === 200 && r.body && r.body.ok) {
    if (intent === "delete") {
      await writeGate({ account: null });
      $("doneTitle").textContent = "Your account is deleted";
      $("doneText").textContent = "Your email and any newsletter signup for it are removed. Bug capture and everything else keep working; Site Audit will ask for a free account again.";
      $("signOut").hidden = true;
      $("deleteAccount").hidden = true;
    } else {
      await writeGate({ account: { email, userId: String(r.body.userId || ""), verifiedAt: Date.now() }, graceUntil: 0 });
      renderSignedIn(email);
    }
    show("stepDone");
    return;
  }
  if (r.status === 400) msg("codeMsg", "That code didn't work. Check the newest email, or send a new code.", true);
  else if (r.status === 429) msg("codeMsg", "Too many tries. Wait a few minutes and try again.", true);
  else if (intent === "delete") msg("codeMsg", "We couldn't reach TraceBug right now. Please try again later.", true);
  else await failOpen("codeMsg");
}

function renderSignedIn(addr) {
  $("doneTitle").textContent = "You're signed in";
  $("doneText").textContent = "";
  $("doneText").append(`Site Audit is unlocked for ${addr}. Go back to your tab and press `);
  const b = document.createElement("b");
  b.textContent = "Re-scan";
  $("doneText").append(b, ".");
  $("signOut").hidden = false;
  $("deleteAccount").hidden = false;
}

function setDeleteMode() {
  intent = "delete";
  $("emailTitle").textContent = "Delete your TraceBug account";
  $("emailIntro").textContent = "We'll email a code to confirm it's you, then delete your account and any newsletter signup for this address. Bug capture and exports keep working without an account.";
  $("marketingRow").hidden = true;
  $("sendCode").textContent = "Email me a code";
  $("verify").textContent = "Delete my account";
}

$("stepEmail").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = $("email").value.trim().toLowerCase();
  if (!EMAIL_RE.test(v)) { msg("emailMsg", "That doesn't look like an email address.", true); return; }
  email = v;
  await sendCode();
});

$("stepCode").addEventListener("submit", (e) => { e.preventDefault(); void verify(); });
$("changeEmail").addEventListener("click", () => { msg("emailMsg", ""); show("stepEmail"); });
$("resend").addEventListener("click", async () => { msg("codeMsg", ""); if (await sendCode()) msg("codeMsg", "New code sent."); });
$("signOut").addEventListener("click", async () => {
  await writeGate({ account: null });
  msg("doneMsg", "Signed out on this browser. Your account still exists; sign in again any time.");
  $("signOut").hidden = true;
});
$("deleteAccount").addEventListener("click", async () => {
  const g = await readGate();
  setDeleteMode();
  $("email").value = (g.account && g.account.email) || "";
  show("stepEmail");
});

(async () => {
  try {
    const r = await chrome.storage.local.get(ENDPOINT_KEY);
    const v = r && r[ENDPOINT_KEY];
    if (typeof v === "string" && v.trim()) endpoint = v.trim().replace(/\/+$/, "");
  } catch {}
  const g = await readGate();
  if (intent === "delete") {
    setDeleteMode();
    $("email").value = (g.account && g.account.email) || "";
    show("stepEmail");
  } else if (g.account && g.account.email) {
    email = g.account.email;
    renderSignedIn(email);
    show("stepDone");
  } else {
    // Opened from the popup's account menu before the free audits ran out.
    const left = 3 - (Number.isFinite(g.audits) ? g.audits : 0);
    if (left > 0) {
      $("emailTitle").textContent = "Sign in to TraceBug";
      $("emailIntro").textContent = `You have ${left} free audit${left === 1 ? "" : "s"} left; after that Site Audit needs a free account: just your email and a 6-digit code, no password. Bug capture, exports and everything else stay free without one.`;
    }
    show("stepEmail");
  }
})();
