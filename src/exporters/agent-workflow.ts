// ── The workflow every TraceBug agent prompt asks for ──────────────────────
// One source for the hand-off card's prompt, the exported .html's AI tab, the
// MCP server's /tracebug:debug_bug_report prompt and the "Fix with AI" chat
// prompt, so they can't drift apart (they had: one said "propose a fix", one
// "implement the fix", only one mentioned the generated test).
//
// No imports: the standalone CLI and the exported file's runtime both embed it.
// No backslashes or backticks in the text: it is interpolated into template
// literals (REPLAY_RUNTIME in html-template.ts).

const ROOT_CAUSE_STEP =
  "Identify the root cause in this codebase. If a value is missing or undefined, find out why first " +
  "(a missing config entry or key, a failed or incomplete request, a wrong identifier, a data transformation) " +
  "instead of only adding a guard.";

/** Steps for an agent that reads the report over MCP. Without `file`, the
 *  agent starts from the newest report. */
export function agentWorkflowSteps(file?: string): string[] {
  const target = file ? `"${file}"` : "the newest report";
  return [
    file
      ? `Call get_bug_report(${target}) and follow its investigation guide to gather the captured evidence: console errors, network failures, repro steps, screenshots.`
      : "Call list_bug_reports (newest first), then get_bug_report on the newest one, and follow its investigation guide to gather the captured evidence: console errors, network failures, repro steps, screenshots.",
    ROOT_CAUSE_STEP,
    "Explain the root cause and the fix you propose, citing the evidence and the files and lines involved.",
    "Ask for approval before editing any files.",
    `Once approved, apply the fix and add or update a regression test. get_playwright_test(${target}) returns a generated failing test you can start from.`,
    "Run the relevant test and report the result: it should fail before the fix and pass after it.",
  ];
}

/** The same workflow for a pasted chat prompt, whose evidence is inline above it. */
export const CHAT_WORKFLOW_STEPS: readonly string[] = [
  "Diagnose from the evidence above: name the most likely root cause and tie your reasoning to it. " +
    "If a value is missing or undefined, explain why it is missing rather than only guarding against it.",
  "List the specific files or components to inspect.",
  "Propose a concrete fix (code where possible).",
  "Add or update a regression test, or give the exact assertions, that would catch this bug if it returns.",
  "If you can run tests, run it: it should fail before the fix and pass after it.",
  "If you can edit files, ask for approval before changing anything.",
];

/** The one Claude Code setup command shown everywhere (hand-off card, MCP
 *  prompt, the exported file's AI tab). `-s user` registers it for every
 *  project; without it Claude Code adds it to the current project only. No
 *  `--dir`: that turns off the server's search of Downloads and Desktop. */
export const CLAUDE_MCP_ADD = "claude mcp add -s user tracebug -- npx -y tracebug mcp";

/** "1. …\n2. …" */
export function numberedSteps(steps: readonly string[]): string {
  return steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
}
