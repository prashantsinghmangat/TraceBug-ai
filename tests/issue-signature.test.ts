// Phase 5, last item: the issue signature.
//
// One line appended to a GitHub, Linear or Slack body. The thing that makes it
// different from the export footer is where it ends up: an issue body is
// written into someone else's tracker — a client's, an employer's — and it
// stays there. So the rules under test are mostly about restraint:
//
//   • default on, one toggle off, remembered
//   • never applied twice, however many code paths a body passes through
//   • Slack gets Slack's link syntax, not markdown
//   • turning it off leaves no trace of it in the body
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  issueSignatureEnabled,
  setIssueSignature,
  signIssueBody,
  signSlackPost,
  _resetIssueSignature,
} from '../src/integrations/issue-signature';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TRACKER = readFileSync(join(root, 'src', 'integrations', 'tracker-client.ts'), 'utf8');
const QUICKBUG = readFileSync(join(root, 'src', 'ui', 'quick-bug.ts'), 'utf8');

describe('the signature defaults on and can be turned off', () => {
  beforeEach(() => { _resetIssueSignature(); });

  it('is on for a fresh profile', () => {
    expect(issueSignatureEnabled()).toBe(true);
    expect(signIssueBody('## Steps\n1. Click')).toContain('Reported with TraceBug');
  });

  it('is off once turned off, and stays off', () => {
    setIssueSignature(false);
    expect(issueSignatureEnabled()).toBe(false);
    const body = '## Steps\n1. Click';
    expect(signIssueBody(body)).toBe(body);
  });

  it('leaves no trace when off — no divider, no blank tail', () => {
    // A stray "---" is a visible artefact in a tracker.
    setIssueSignature(false);
    expect(signIssueBody('body')).toBe('body');
    expect(signIssueBody('body')).not.toContain('---');
  });

  it('comes back when turned on again', () => {
    setIssueSignature(false);
    setIssueSignature(true);
    expect(signIssueBody('body')).toContain('Reported with TraceBug');
  });
});

describe('what the line actually says', () => {
  beforeEach(() => { _resetIssueSignature(); });

  it('links to the listing tagged as an issue', () => {
    const out = signIssueBody('body');
    expect(out).toContain('utm_source=issue');
    expect(out).toContain('chromewebstore.google.com');
    // Markdown link, italicised, below a divider.
    expect(out).toMatch(/\n---\n\n_\[Reported with TraceBug\]\(https:\/\/\S+\)_$/);
  });

  it('uses Slack link syntax for Slack, not markdown', () => {
    const out = signSlackPost('*Bug*\nsomething broke');
    expect(out).toMatch(/_<https:\/\/\S+\|Reported with TraceBug>_$/);
    expect(out).not.toContain('](');
  });

  it('claims nothing about the reporter', () => {
    // "Reported with", not "Reported by" — the tool did not report it, and the
    // line must not read as a byline on someone else's bug.
    const out = signIssueBody('body');
    expect(out).toContain('Reported with TraceBug');
    expect(out).not.toMatch(/reported by|filed by|powered by|created by/i);
  });
});

describe('it cannot be applied twice', () => {
  beforeEach(() => { _resetIssueSignature(); });

  it('is idempotent on a markdown body', () => {
    // GitHub and Linear share issueBody, and a body can pass through more than
    // one helper; two credits would be worse than none.
    const once = signIssueBody('body');
    expect(signIssueBody(once)).toBe(once);
  });

  it('is idempotent on a Slack post', () => {
    const once = signSlackPost('text');
    expect(signSlackPost(once)).toBe(once);
  });

  it('replaces the old unlinked Slack line rather than adding to it', () => {
    // slack-export.ts already ended every post with "_Reported via TraceBug_".
    const legacy = '*Bug*\nbroke\n\n_Reported via TraceBug_';
    const out = signSlackPost(legacy);
    expect(out).not.toContain('Reported via TraceBug');
    expect(out.match(/Reported with TraceBug/g) ?? []).toHaveLength(1);
  });

  it('keeps the old unlinked line when the signature is off', () => {
    // Turning the credit off should not silently delete copy that predates it.
    setIssueSignature(false);
    const legacy = '*Bug*\nbroke\n\n_Reported via TraceBug_';
    expect(signSlackPost(legacy)).toContain('_Reported via TraceBug_');
  });
});

describe('every send path is signed at one chokepoint', () => {
  it('signs issueBody, which GitHub, Linear and the bridge all use', () => {
    expect(TRACKER).toContain('return signIssueBody(generateGitHubIssue(report)');
    // All four call sites go through issueBody / slackText, never the raw
    // generators — that is what keeps the paths from drifting.
    expect(TRACKER).toContain('body: issueBody(report) }, signal)');
    expect(TRACKER.match(/generateSlackPost\(report\)/g) ?? []).toHaveLength(1);
    expect(TRACKER.match(/slackText\(report\)/g) ?? []).toHaveLength(2);
  });

  it('covers the extension bridge path, not just the page path', () => {
    // Extension mode sends content through the worker; it must carry the
    // signature too, or the same action signs or doesn't by mode.
    const bridge = TRACKER.slice(TRACKER.indexOf('if (isExtensionMode())'));
    expect(bridge).toContain('slackText(report)');
    expect(bridge).toContain('issueBody(report)');
  });
});

describe('the toggle is reachable, and reads clearly', () => {
  it('sits in the export menu as a checkbox item, defaulting on', () => {
    expect(QUICKBUG).toContain('data-action="toggle-issue-signature"');
    expect(QUICKBUG).toContain('role="menuitemcheckbox"');
    expect(QUICKBUG).toContain('Issue credit: on');
    expect(QUICKBUG).toContain('Issue credit: off');
  });

  it('says what turning it off means', () => {
    expect(QUICKBUG).toContain('issues carry no TraceBug line');
  });

  it('sits next to the export-footer toggle', () => {
    // Both are "what leaves TraceBug carries a credit" settings; finding one
    // should mean finding the other.
    const footer = QUICKBUG.indexOf('data-action="toggle-export-footer"');
    const sig = QUICKBUG.indexOf('data-action="toggle-issue-signature"');
    expect(footer).toBeGreaterThan(-1);
    expect(sig).toBeGreaterThan(footer);
    expect(sig - footer).toBeLessThan(900);
  });
});
