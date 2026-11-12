import { describe, it, expect } from 'vitest';
import { CLAUDE_MCP_ADD } from '../src/exporters/agent-workflow';
import { generateAIPrompt, generateMcpPrompt } from '../src/exporters/ai-prompt';
import { buildReplayHtml, type BundlePayload } from '../src/exporters/html-template';
import { composeGitHubIssueMarkdown, filingDescription } from '../src/ui/quick-bug';
import type { BugReport } from '../src/types';

// Found by a hand test of the 1.11.6 zip (2026-11-11): the exported file was
// still indigo, the prompt disagreed with the card about the setup command,
// the GitHub markdown printed everything twice, and the AI prompt listed JS
// chunk loads as "recent successful calls".

const replayHtml = () =>
  buildReplayHtml({
    meta: { title: 't', severity: 'low', summary: '', page: '/', generatedAt: 1, sessionId: 's', environment: '', durationMs: 0 },
    events: [], screenshots: [], consoleErrors: [], networkErrors: [],
  } as unknown as BundlePayload);

describe('one Claude Code setup command everywhere', () => {
  it('is user-scoped and has no --dir', () => {
    expect(CLAUDE_MCP_ADD).toBe('claude mcp add -s user tracebug -- npx -y tracebug mcp');
  });

  it('the hand-off prompt and the exported AI tab use it', () => {
    expect(generateMcpPrompt('r.html')).toContain(CLAUDE_MCP_ADD);
    expect(generateMcpPrompt('r.html')).not.toContain('claude mcp add tracebug');
    expect(replayHtml()).toContain(JSON.stringify(CLAUDE_MCP_ADD));
    expect(replayHtml()).not.toContain("'claude mcp add tracebug");
  });
});

describe('exported report uses the Midnight coral theme', () => {
  const html = replayHtml();

  it('coral accent in light and dark, no indigo accent', () => {
    expect(html).toContain('--tb-accent: #C81E3C;');
    expect(html).toContain('--tb-accent: #FF5C6C;');
    expect(html).not.toMatch(/--tb-accent: #(6366F1|4F46E5);/i);
  });

  it('text on a coral fill uses the on-accent token, never hard-coded white', () => {
    expect(html).toContain('--tb-on-accent: #0B0D14;');
    expect(html).not.toMatch(/background: ?var\(--tb-accent[^)]*\); ?color: ?#fff/i);
  });

  it('shows the prompt logo, not the old bug emoji', () => {
    expect(html).not.toContain('🐞');
    expect(html).toContain('M30 33 L47 48 L30 63');
  });
});

describe('AI prompt network context', () => {
  const report = (networkRequests: Array<Record<string, unknown>>) =>
    ({ title: 't', networkErrors: [], networkRequests }) as unknown as BugReport;

  it('lists successful API calls, not script, style or image loads', () => {
    const p = generateAIPrompt(report([
      { method: 'GET', url: 'https://app.example.com/vite/assets/similar-menu-CPIo_mbH.js', status: 200 },
      { method: 'GET', url: 'https://app.example.com/assets/app.css', status: 200 },
      { method: 'GET', url: 'https://app.example.com/img/logo.png', status: 200 },
      { method: 'GET', url: 'https://app.example.com/api/orders/42', status: 200 },
    ]));
    expect(p).toContain('GET https://app.example.com/api/orders/42 → 200');
    expect(p).not.toContain('similar-menu');
    expect(p).not.toContain('app.css');
    expect(p).not.toContain('logo.png');
  });

  it('omits the section when only assets loaded', () => {
    const p = generateAIPrompt(report([{ method: 'GET', url: 'https://a.example/x.js', status: 200 }]));
    expect(p).not.toContain('Recent successful calls');
  });

  it('does not point at a cloud link that does not exist', () => {
    const p = generateAIPrompt({ ...report([]), screenshots: [{ filename: '01.png', dataUrl: 'data:,' }] } as unknown as BugReport);
    expect(p).not.toMatch(/cloud link/i);
    expect(p).toContain('exported .html report');
  });
});

describe('issue markdown does not repeat the auto-generated description', () => {
  const auto = '> Possible Cause\n\n**Summary:** clicked X\n\n**Steps to reproduce:**\nClick X';
  const issue = '## No errors captured: Click X\n\n> Possible Cause\n\n> **TL;DR:** clicked X\n';

  it('drops the untouched prefill, keeps anything the user wrote', () => {
    expect(filingDescription(auto, auto)).toBe('');
    expect(filingDescription(`  ${auto}\n`, auto)).toBe('');
    expect(filingDescription(`${auto}\n\nExpected 20% off.`, auto)).toContain('Expected 20% off.');
    expect(filingDescription('Total is wrong', undefined)).toBe('Total is wrong');
  });

  it('prints the cause once without a description, and the description above a rule with one', () => {
    const bare = composeGitHubIssueMarkdown('No errors captured: Click X', '', issue);
    expect(bare.match(/Possible Cause/g)).toHaveLength(1);
    expect(bare).not.toContain('---');
    expect(bare.startsWith('# No errors captured: Click X\n')).toBe(true);
    expect(bare).not.toContain('## No errors captured');

    const withDesc = composeGitHubIssueMarkdown('T', 'Expected 20% off.', issue);
    expect(withDesc).toBe('# T\n\nExpected 20% off.\n\n---\n\n\n> Possible Cause\n\n> **TL;DR:** clicked X\n');
  });
});
