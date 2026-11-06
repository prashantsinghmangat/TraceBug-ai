import PageMascot from "@/components/PageMascot";
import { Logo, type LogoName } from "@/components/ui/logos";

// Where a report goes after capture: a hub with Page in the middle and every
// real destination around it. Only what the product does today — keep in step
// with src/providers/api.ts (direct sends), the exporters in src/exporters and
// src/{jira,github,linear}-issue.ts (copies), and the MCP server (agents).

type Group = "agent" | "send" | "copy";

const GROUPS: Record<Group, { label: string; note: string; dot: string; line: string }> = {
  agent: {
    label: "Hands it to your AI agent",
    note: "Claude Code, Cursor, Windsurf and VS Code read the report over the local MCP server.",
    dot: "bg-primary",
    line: "rgb(var(--primary))",
  },
  send: {
    label: "Files it for you",
    note: "GitHub issues, Linear and Slack with your own token, sent from your browser. Every send asks first.",
    dot: "bg-text-primary",
    line: "rgb(var(--text-primary))",
  },
  copy: {
    label: "Copies it anywhere else",
    note: "Jira markup, issue Markdown, PDF and a Playwright test you can paste or attach.",
    dot: "bg-text-subtle",
    line: "rgb(var(--text-subtle))",
  },
};

const NODES: { label: string; logo: LogoName; group: Group }[] = [
  { label: "Claude Code", logo: "claude", group: "agent" },
  { label: "Cursor", logo: "cursor", group: "agent" },
  { label: "Windsurf", logo: "windsurf", group: "agent" },
  { label: "VS Code", logo: "vscode", group: "agent" },
  { label: "GitHub", logo: "github", group: "send" },
  { label: "Linear", logo: "linear", group: "send" },
  { label: "Slack", logo: "slack", group: "send" },
  { label: "Jira", logo: "jira", group: "copy" },
  { label: "Markdown", logo: "markdown", group: "copy" },
  { label: "PDF", logo: "pdf", group: "copy" },
  { label: "Playwright", logo: "playwright", group: "copy" },
];

// Positions on a circle, in % of the square stage (centre 50/50).
const R = 40;
const PLACED = NODES.map((n, i) => {
  const a = -Math.PI / 2 + (i / NODES.length) * Math.PI * 2;
  return { ...n, x: +(50 + R * Math.cos(a)).toFixed(2), y: +(50 + R * Math.sin(a)).toFixed(2) };
});

export default function Integrations() {
  return (
    <section id="integrations" className="border-t border-border py-section">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <div className="min-w-0">
          <span className="mb-4 inline-flex font-mono text-[13px] text-text-subtle">Integrations</span>
          <h2 className="text-h3 font-medium text-text-primary">
            Send it where your team already works
          </h2>
          <p className="mt-4 max-w-xl text-lead text-text-muted">
            One capture, every destination. No TraceBug server in the middle: the report goes straight from
            your browser to the tool you pick.
          </p>

          <ul className="mt-8 space-y-5">
            {(Object.keys(GROUPS) as Group[]).map((g) => (
              <li key={g} className="flex gap-3">
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${GROUPS[g].dot}`} />
                <div>
                  <div className="text-[15px] font-medium text-text-primary">{GROUPS[g].label}</div>
                  <p className="mt-1 text-[14px] leading-[1.55] text-text-muted">{GROUPS[g].note}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* the hub */}
        <div className="relative mx-auto aspect-square w-full max-w-[520px]" aria-hidden="true">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
            <circle cx="50" cy="50" r={R} fill="none" stroke="rgb(var(--border))" strokeWidth="0.25" />
            {PLACED.map((n) => (
              <line
                key={n.label}
                x1="50"
                y1="50"
                x2={n.x}
                y2={n.y}
                stroke={GROUPS[n.group].line}
                strokeOpacity="0.35"
                strokeWidth="0.3"
                strokeDasharray="1 1.2"
              />
            ))}
          </svg>

          <div className="absolute left-1/2 top-1/2 flex h-[34%] w-[34%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background shadow-card">
            <PageMascot size={120} className="h-[78%] w-[78%]" />
          </div>

          {PLACED.map((n) => (
            <span
              key={n.label}
              className="absolute inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background py-1.5 pl-2.5 pr-3 text-[12px] font-medium text-text-primary shadow-card sm:text-[13px]"
              style={{ left: `${n.x}%`, top: `${n.y}%` }}
            >
              <Logo name={n.logo} size={14} className="text-text-primary" />
              {n.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
