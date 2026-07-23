import type { Metadata } from "next";
import { ToolBugReportPage, type ToolBugReportData } from "@/components/ToolBugReportPage";

export const metadata: Metadata = {
  title: "Claude Code Bug Reports — capture a bug, let Claude fix it | TraceBug",
  description:
    "Give Claude Code the bug context it needs to fix frontend bugs: capture a browser session into one file Claude reads over MCP — console, network, replay, repro steps — then reproduces and fixes it with a generated failing test. Free, local-first.",
  alternates: { canonical: "/claude-code-bug-reports" },
  openGraph: {
    title: "Claude Code Bug Reports — capture a bug, let Claude fix it",
    description:
      "One command connects TraceBug to Claude Code. It reads the captured evidence over MCP and fixes the bug — verified by a generated failing test.",
    url: "https://tracebug.dev/claude-code-bug-reports",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
};

const data: ToolBugReportData = {
  tool: "Claude Code",
  slug: "claude-code",
  agentNote:
    "Claude Code registers MCP servers with a single command — the fastest setup of any tool. Run it once and Claude can read every TraceBug export on your machine; there's also a built-in prompt, /tracebug:debug_bug_report.",
  setup: {
    kind: "command",
    label: "Terminal — run once",
    code: "claude mcp add tracebug --scope user -- npx -y tracebug mcp",
  },
  setupDocPath: "/docs/mcp/claude-code",
};

export default function Page() {
  return <ToolBugReportPage data={data} />;
}
