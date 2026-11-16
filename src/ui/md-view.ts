// ── Read view for the ticket description ─────────────────────────────────
// The description is markdown (it goes into GitHub / Jira / exports as is),
// but in the ticket modal people should read it as text, not as `**` and `>`.
// This turns the small subset the report builder writes — headings, quotes,
// bullet and numbered lists, fenced code, **bold**, `code`, [links](…) — into
// escaped HTML. Everything is escaped first; nothing from the text becomes a
// tag, an attribute or a URL (links render as their text only).

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Inline markdown on ONE escaped line. */
function inline(escaped: string): string {
  return escaped
    // `code` first so its contents are not formatted.
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, "$1<em>$2</em>")
    // _italic_ only at word edges, so snake_case names stay as they are.
    .replace(/(^|[\s(])_([^_\s][^_]*)_(?=$|[\s.,:;!?)])/g, "$1<em>$2</em>")
    // [text](url) → text. The URL is dropped on purpose (no live links here).
    // One level of parentheses inside the URL is allowed (wiki-style links).
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, "$1");
}

export function renderMarkdownView(md: string): string {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let inCode = false;
  let code: string[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.join("<br>")}</p>`);
    para = [];
  };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (const raw of lines) {
    if (/^\s*```/.test(raw)) {
      if (inCode) { out.push(`<pre><code>${code.map(esc).join("\n")}</code></pre>`); code = []; inCode = false; }
      else { flushPara(); closeList(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(raw); continue; }

    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); closeList(); continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushPara(); closeList(); out.push(`<div class="md-h md-h${Math.min(h[1].length, 3)}">${inline(esc(h[2]))}</div>`); continue; }

    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) { flushPara(); closeList(); out.push(`<div class="md-quote">${inline(esc(q[1]))}</div>`); continue; }

    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline(esc((ul || ol)![1]))}</li>`);
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPara(); closeList(); out.push("<hr>"); continue; }

    closeList();
    para.push(inline(esc(line)));
  }
  if (inCode) out.push(`<pre><code>${code.map(esc).join("\n")}</code></pre>`);
  flushPara();
  closeList();
  return out.join("");
}

/** CSS for the read view, scoped under `scope`. */
export function mdViewCss(scope: string): string {
  const V = `${scope} .tb-qb-desc-view`;
  return `
    ${V} { padding:12px 14px; font-size:13px; line-height:1.55; color:var(--tb-text-primary); border-top:1px solid var(--tb-border); max-height:320px; overflow:auto; cursor:text; word-break:break-word; }
    ${V}:hover { background:var(--tb-bg-secondary); }
    ${V} p { margin:0 0 8px; }
    ${V} ul, ${V} ol { margin:0 0 8px; padding-left:20px; }
    ${V} li { margin:2px 0; }
    ${V} .md-h { font-weight:700; margin:10px 0 6px; }
    ${V} .md-h1 { font-size:15px; } ${V} .md-h2 { font-size:14px; } ${V} .md-h3 { font-size:13px; }
    ${V} .md-quote { margin:0 0 8px; padding:6px 10px; border-left:3px solid var(--tb-accent); background:var(--tb-accent-subtle); border-radius:0 var(--tb-radius-sm, 6px) var(--tb-radius-sm, 6px) 0; }
    ${V} code { font-family:var(--tb-font-mono); font-size:12px; background:var(--tb-bg-secondary); border:1px solid var(--tb-border); border-radius:4px; padding:0 4px; }
    ${V} pre { margin:0 0 8px; padding:8px 10px; background:var(--tb-bg-secondary); border:1px solid var(--tb-border); border-radius:var(--tb-radius-sm, 6px); overflow:auto; }
    ${V} pre code { border:none; background:none; padding:0; }
    ${V} hr { border:none; border-top:1px solid var(--tb-border); margin:10px 0; }
    ${V} .md-empty { color:var(--tb-text-muted); font-style:italic; }
    ${scope} .tb-qb-desc-bar { display:flex; justify-content:flex-end; gap:6px; padding:0 10px 8px; margin-top:-4px; }
    ${scope} .tb-qb-desc-mode { display:inline-flex; align-items:center; gap:5px; font:600 11px/1 var(--tb-font-family, system-ui, sans-serif); color:var(--tb-text-secondary); background:transparent; border:1px solid var(--tb-border); border-radius:999px; padding:4px 10px; cursor:pointer; }
    ${scope} .tb-qb-desc-mode:hover { color:var(--tb-text-primary); border-color:var(--tb-border-hover); }
    ${scope} .tb-qb-desc-mode[aria-pressed="true"] { color:var(--tb-accent); border-color:var(--tb-accent); background:var(--tb-accent-subtle); }
  `;
}
