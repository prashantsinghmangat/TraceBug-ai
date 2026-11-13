// Email for tracebug.dev: Resend's REST API through plain fetch (no SDK dependency).
// Plain .mjs so both the API routes (TypeScript) and scripts/email.mjs (run by hand
// with node) use the same sender, confirm email and unsubscribe footer.
//
// Env: RESEND_API_KEY, EMAIL_FROM ("TraceBug <updates@tracebug.dev>"), EMAIL_REPLY_TO
// (an inbox you read: the privacy page says "reply to any email" to be deleted, so
// nothing sends without it), optional EMAIL_POSTAL_ADDRESS (update footer) and
// NEXT_PUBLIC_SITE_URL for the links. Nothing here decides WHO may be emailed —
// callers only pass unconfirmed addresses to confirmEmail() and only rows of the
// email_subscribers view to updateEmail().

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://tracebug.dev").replace(/\/$/, "");

export const confirmUrl = (token) => `${siteUrl()}/api/confirm?token=${encodeURIComponent(token)}`;
export const unsubscribeUrl = (token) => `${siteUrl()}/api/unsubscribe?token=${encodeURIComponent(token)}`;

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.EMAIL_REPLY_TO);
}

/**
 * @param {{ to: string, subject: string, text: string, html: string, headers?: Record<string, string> }} msg
 * @returns {Promise<{ id: string }>}
 */
export async function sendEmail({ to, subject, text, html, headers }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      text,
      html,
      headers,
      reply_to: process.env.EMAIL_REPLY_TO,
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Plain text → minimal HTML: paragraphs on blank lines, <br> on single newlines, bare URLs linked. */
function textToHtml(text) {
  const paras = text.trim().split(/\n{2,}/).map((p) =>
    esc(p)
      .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`)
      .replace(/\n/g, "<br>"));
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:560px">${paras.map((p) => `<p>${p}</p>`).join("")}</div>`;
}

/** @param {string} token the signup row's confirm_token */
export function confirmEmail(token) {
  const url = confirmUrl(token);
  const text = `Hi,

Someone (hopefully you) asked for TraceBug updates at this address. Confirm it here:
${url}

What you'll get: at most one email a month about new features and early access. Every email has a one-click unsubscribe link.

Didn't ask for this? Ignore this email. Nothing more will be sent to this address.

TraceBug - ${siteUrl()}`;
  return { subject: "Confirm your TraceBug updates", text, html: textToHtml(text) };
}

/**
 * A monthly update for one subscriber, with the unsubscribe link in the body
 * and the one-click List-Unsubscribe headers (RFC 8058) mail clients show.
 * @param {{ subject: string, body: string, unsubscribeToken: string }} opts
 */
export function updateEmail({ subject, body, unsubscribeToken }) {
  const unsub = unsubscribeUrl(unsubscribeToken);
  const address = process.env.EMAIL_POSTAL_ADDRESS ? `\n${process.env.EMAIL_POSTAL_ADDRESS}` : "";
  const text = `${body.trim()}

--
You get this because you signed up for TraceBug updates and confirmed your address.
Unsubscribe in one click: ${unsub}${address}`;
  return {
    subject,
    text,
    html: textToHtml(text),
    headers: {
      "List-Unsubscribe": `<${unsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
