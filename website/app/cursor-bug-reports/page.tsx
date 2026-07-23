import type { Metadata } from "next";
import { ToolBugReportPage, type ToolBugReportData } from "@/components/ToolBugReportPage";

export const metadata: Metadata = {
  title: "Cursor Bug Reports — capture a bug, let Cursor's agent fix it | TraceBug",
  description:
    "Give Cursor's agent the bug context it needs to fix frontend bugs: capture a browser session into one file Cursor reads over MCP — console, network, replay, repro steps — then reproduces and fixes it with a generated failing test. Free, local-first.",
  alternates: { canonical: "/cursor-bug-reports" },
  openGraph: {
    title: "Cursor Bug Reports — capture a bug, let Cursor's agent fix it",
    description:
      "A small .cursor/mcp.json connects TraceBug to Cursor. Its agent reads the captured evidence over MCP and fixes the bug — verified by a generated failing test.",
    url: "https://tracebug.dev/cursor-bug-reports",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
};

const data: ToolBugReportData = {
  tool: "Cursor",
  slug: "cursor",
  agentNote:
    "Cursor reads MCP servers from a JSON config — project-level or global. Add the tracebug entry, enable it in Settings → MCP, and Cursor's Agent mode can read every TraceBug export on your machine.",
  setup: {
    kind: "json",
    label: ".cursor/mcp.json (project) or ~/.cursor/mcp.json (global)",
    code: `{
  "mcpServers": {
    "tracebug": {
      "command": "npx",
      "args": ["-y", "tracebug", "mcp"]
    }
  }
}`,
  },
  setupDocPath: "/docs/mcp/cursor",
};

export default function Page() {
  return <ToolBugReportPage data={data} />;
}
