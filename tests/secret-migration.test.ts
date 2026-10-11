// Phase 2a: lazy migration of pre-1.11 page-stored secrets.
//
// Tests the real shipped planner from tracebug-extension/secret-migration.js
// (injected into the content script's isolated world; exported via CommonJS so
// it can be required here rather than duplicated).
//
// The conflict rule is the load-bearing part: when extension storage already
// holds a config we KEEP it and discard the page copy, because users may have
// saved different tokens on different sites and overwriting could replace a
// newer token with an older one. A silent discard would lose work, so the
// discard must always produce a user-facing notice naming the site.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Evaluate the shipped file the same way the browser does — as a plain script
// that publishes a global — so this tests the real artifact, not a copy.
const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');
const sandbox: Record<string, unknown> = {};
const ctx = createContext(sandbox);
runInContext(readFileSync(join(extDir, 'secret-migration.js'), 'utf8'), ctx);

interface MigrationPlan {
  writes: Record<string, never>;
  discarded: string[];
  removeFromPage: boolean;
}
const M = sandbox.TraceBugSecretMigration as {
  INT_KEY: string;
  AI_KEY: string;
  NOTICE_KEY: string;
  planSecretMigration: (
    pageInt: unknown, pageAi: unknown, pageLegacyAi: unknown, stored: unknown, site: string,
  ) => MigrationPlan;
};

const { INT_KEY, AI_KEY, NOTICE_KEY, planSecretMigration } = M;

it('publishes its API as a global for the content script to call', () => {
  expect(typeof planSecretMigration).toBe('function');
});

const pageInt = { github: { token: 'ghp_fromPage', repo: 'o/r' } };
const pageAi = { provider: 'anthropic', apiKey: 'sk-fromPage', model: 'm' };

describe('planSecretMigration — nothing to do', () => {
  it('plans no write and no removal when the page holds nothing', () => {
    const plan = planSecretMigration(null, null, null, {}, 'example.com');
    expect(plan.writes).toEqual({});
    expect(plan.discarded).toEqual([]);
    expect(plan.removeFromPage).toBe(false);
  });
});

describe('planSecretMigration — move into empty extension storage', () => {
  it('migrates integration tokens and clears the page copy', () => {
    const plan = planSecretMigration(pageInt, null, null, {}, 'example.com');
    expect(plan.writes[INT_KEY]).toEqual(pageInt);
    expect(plan.discarded).toEqual([]);
    expect(plan.removeFromPage).toBe(true);
    // No notice: nothing was lost.
    expect(plan.writes[NOTICE_KEY]).toBeUndefined();
  });

  it('migrates the AI config', () => {
    const plan = planSecretMigration(null, pageAi, null, {}, 'example.com');
    expect(plan.writes[AI_KEY]).toEqual(pageAi);
    expect(plan.removeFromPage).toBe(true);
  });

  it('migrates the legacy bare anthropic key', () => {
    const legacy = { provider: 'anthropic', apiKey: 'sk-bareLegacy', model: '' };
    const plan = planSecretMigration(null, null, legacy, {}, 'example.com');
    expect(plan.writes[AI_KEY]).toEqual(legacy);
    expect(plan.removeFromPage).toBe(true);
  });

  it('prefers a full ai_config over the bare legacy key when both exist', () => {
    const legacy = { provider: 'anthropic', apiKey: 'sk-bareLegacy', model: '' };
    const plan = planSecretMigration(null, pageAi, legacy, {}, 'example.com');
    expect(plan.writes[AI_KEY]).toEqual(pageAi);
  });

  it('migrates both kinds in one pass', () => {
    const plan = planSecretMigration(pageInt, pageAi, null, {}, 'example.com');
    expect(plan.writes[INT_KEY]).toEqual(pageInt);
    expect(plan.writes[AI_KEY]).toEqual(pageAi);
    expect(plan.discarded).toEqual([]);
  });
});

describe('planSecretMigration — conflict keeps the existing config', () => {
  const stored = {
    [INT_KEY]: { github: { token: 'ghp_alreadyInExtension', repo: 'o/other' } },
  };

  it('does not overwrite integration tokens already in extension storage', () => {
    const plan = planSecretMigration(pageInt, null, null, stored, 'staging.example.com');
    expect(plan.writes[INT_KEY]).toBeUndefined();
    expect(plan.discarded).toContain('integration tokens');
    // The page copy still goes — it is redundant either way.
    expect(plan.removeFromPage).toBe(true);
  });

  it('records a notice naming the site whose token was discarded', () => {
    const plan = planSecretMigration(pageInt, null, null, stored, 'staging.example.com');
    const notices = plan.writes[NOTICE_KEY];
    expect(Array.isArray(notices)).toBe(true);
    expect(notices).toHaveLength(1);
    expect(notices[0].site).toBe('staging.example.com');
    expect(notices[0].what).toBe('integration tokens');
  });

  it('names both kinds in one notice when both conflict', () => {
    const both = { [INT_KEY]: stored[INT_KEY], [AI_KEY]: { provider: 'openai', apiKey: 'sk-kept', model: 'm' } };
    const plan = planSecretMigration(pageInt, pageAi, null, both, 'staging.example.com');
    expect(plan.writes[INT_KEY]).toBeUndefined();
    expect(plan.writes[AI_KEY]).toBeUndefined();
    expect(plan.writes[NOTICE_KEY][0].what).toBe('integration tokens and an AI key');
  });

  it('appends to existing notices rather than replacing them', () => {
    const withPrior = {
      ...stored,
      [NOTICE_KEY]: [{ site: 'first.example.com', what: 'an AI key' }],
    };
    const plan = planSecretMigration(pageInt, null, null, withPrior, 'second.example.com');
    expect(plan.writes[NOTICE_KEY]).toHaveLength(2);
    expect(plan.writes[NOTICE_KEY][0].site).toBe('first.example.com');
    expect(plan.writes[NOTICE_KEY][1].site).toBe('second.example.com');
  });

  it('caps the notice backlog so many stale origins cannot grow it without bound', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ site: `s${i}.example.com`, what: 'an AI key' }));
    const plan = planSecretMigration(pageInt, null, null, { ...stored, [NOTICE_KEY]: many }, 'newest.example.com');
    expect(plan.writes[NOTICE_KEY]).toHaveLength(20);
    // The most recent entries are the actionable ones.
    expect(plan.writes[NOTICE_KEY][19].site).toBe('newest.example.com');
    expect(plan.writes[NOTICE_KEY][18].site).toBe('s39.example.com');
  });

  it('migrates the non-conflicting half and discards only the conflicting one', () => {
    const plan = planSecretMigration(pageInt, pageAi, null, stored, 'staging.example.com');
    expect(plan.writes[INT_KEY]).toBeUndefined();       // conflicted → kept existing
    expect(plan.writes[AI_KEY]).toEqual(pageAi);        // no conflict → migrated
    expect(plan.discarded).toEqual(['integration tokens']);
  });
});

describe('planSecretMigration — resilience', () => {
  it('tolerates a missing/odd stored object', () => {
    expect(planSecretMigration(pageInt, null, null, null as never, 'x.com').writes[INT_KEY]).toEqual(pageInt);
  });

  it('falls back to a generic site label', () => {
    const plan = planSecretMigration(pageInt, null, null, { [INT_KEY]: {} }, '');
    expect(plan.writes[NOTICE_KEY][0].site).toBe('another site');
  });

  it('ignores a non-array notice backlog instead of throwing', () => {
    const plan = planSecretMigration(pageInt, null, null, { [INT_KEY]: {}, [NOTICE_KEY]: 'corrupt' }, 'x.com');
    expect(plan.writes[NOTICE_KEY]).toHaveLength(1);
  });
});
