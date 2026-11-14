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

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const P = `margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:#2b2f3a`;

/** Plain text → HTML paragraphs: blank line = new paragraph, newline = <br>, bare URLs linked. */
function textToHtml(text) {
  return text.trim().split(/\n{2,}/).map((p) =>
    `<p style="${P}">${esc(p)
      .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#C81E3C">${u}</a>`)
      .replace(/\n/g, "<br>")}</p>`).join("");
}

/**
 * The one TraceBug email layout: logo + name, a white card, an optional button, a
 * small footer. Tables and inline styles only, because that's what every mail client
 * (Gmail, Outlook, Apple Mail) renders the same way. The logo is a PNG on tracebug.dev
 * (Gmail blocks SVG); images off still reads fine, since the name is text.
 * Supabase's sign-in email copies this look: website/supabase/email-templates/.
 * @param {{ preheader: string, heading: string, bodyHtml: string, button?: { url: string, label: string }, footerHtml: string }} o
 */
function layout({ preheader, heading, bodyHtml, button, footerHtml }) {
  const site = siteUrl();
  const btn = button ? `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr>
            <td style="border-radius:8px;background:#C81E3C">
              <a href="${button.url}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${esc(button.label)}</a>
            </td></tr></table>
          <p style="margin:0 0 16px;font-family:${FONT};font-size:12.5px;line-height:1.5;color:#6b7280">Button not working? Paste this link into your browser:<br><a href="${button.url}" style="color:#6b7280;word-break:break-all">${button.url}</a></p>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
      <tr><td style="padding:0 4px 18px">
        <a href="${site}" style="text-decoration:none;color:#0b0d14"><img src="${site}/email/tracebug-logo.png" width="32" height="32" alt="" style="vertical-align:middle;border:0;border-radius:8px"><span style="vertical-align:middle;margin-left:10px;font-family:${FONT};font-size:17px;font-weight:700;color:#0b0d14">TraceBug</span></a>
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px 32px 16px">
          <h1 style="margin:0 0 16px;font-family:${FONT};font-size:21px;line-height:1.3;color:#0b0d14">${esc(heading)}</h1>
          ${bodyHtml}${btn}
      </td></tr>
      <tr><td style="padding:18px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:#6b7280">
        ${footerHtml}<br>
        <a href="${site}" style="color:#6b7280">TraceBug</a> · Local-first bug reports and site audits for developers.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/** @param {string} token the signup row's confirm_token */
export function confirmEmail(token) {
  const url = confirmUrl(token);
  const text = `Hi,

Someone (hopefully you) asked for TraceBug updates at this address. Confirm it here:
${url}

What you'll get: at most one email a month about new features and early access. Every email has a one-click unsubscribe link.

Didn't ask for this? Ignore this email. You won't get any updates unless you confirm.

TraceBug - ${siteUrl()}`;
  const html = layout({
    preheader: "One click to confirm. At most one email a month.",
    heading: "Confirm your email",
    bodyHtml: `<p style="${P}">Someone (hopefully you) asked for TraceBug updates at this address.</p>
          <p style="${P}">You'll get <b>at most one email a month</b> about new features and early access, and every email has a one-click unsubscribe link.</p>`,
    button: { url, label: "Confirm my email" },
    footerHtml: "Didn't ask for this? Ignore this email. You won't get any updates unless you confirm.",
  });
  return { subject: "Confirm your TraceBug updates", text, html };
}

/**
 * A monthly update for one subscriber, with the unsubscribe link in the body
 * and the one-click List-Unsubscribe headers (RFC 8058) mail clients show.
 * @param {{ subject: string, body: string, unsubscribeToken: string }} opts
 */
export function updateEmail({ subject, body, unsubscribeToken }) {
  const unsub = unsubscribeUrl(unsubscribeToken);
  const postal = process.env.EMAIL_POSTAL_ADDRESS || "";
  const text = `${body.trim()}

--
You get this because you signed up for TraceBug updates and confirmed your address.
Unsubscribe in one click: ${unsub}${postal ? `\n${postal}` : ""}`;
  const html = layout({
    preheader: body.trim().split("\n")[0].slice(0, 120),
    heading: subject,
    bodyHtml: textToHtml(body),
    footerHtml: `You get this because you signed up for TraceBug updates and confirmed your address.
        <a href="${unsub}" style="color:#6b7280">Unsubscribe in one click</a>.${postal ? `<br>${esc(postal)}` : ""}`,
  });
  return {
    subject,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${unsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
