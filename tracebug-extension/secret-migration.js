// ── Pre-1.11 secret migration: the decision, with no I/O ────────────────────
// Before 1.11 the SDK wrote integration tokens and the AI key into the HOST
// PAGE's localStorage, where any script on that site could read them. 1.11
// keeps them in chrome.storage.local instead (see docs/launch/PLAN.md Phase 2).
//
// There is no way to enumerate which origins hold old keys without reading
// every site, so migration is LAZY: whenever the content script runs on an
// origin that still has them, it moves them and deletes the page copy.
//
// This file holds only the decision — what to write, what to discard, what to
// tell the user — so it can be unit-tested directly. content-script.js does
// the actual storage reads and writes. Injected into the content script's
// isolated world ahead of content-script.js, which calls the global.
// ─────────────────────────────────────────────────────────────────────────────

(function (root) {
  var INT_KEY = "tb_integrations_v1";
  var AI_KEY = "tb_ai_config_v1";
  var NOTICE_KEY = "tb_migration_notices";

  /**
   * Decide what to do with secrets found in one origin's page storage.
   *
   * Conflict rule: if extension storage already holds a config we KEEP it and
   * discard the page copy. Users may have saved different tokens on different
   * sites, so overwriting could replace a newer token with an older one — but
   * a silent discard would lose work, so the discard is reported back and the
   * options page shows a one-time notice naming the site.
   *
   * @param {object|null} pageInt   parsed `tracebug_integrations` from the page
   * @param {object|null} pageAi    parsed `tracebug_ai_config` from the page
   * @param {object|null} pageLegacyAi  synthesized from the bare `tracebug_ai_key`
   * @param {object} stored         current chrome.storage.local contents
   * @param {string} site           hostname, for the notice text
   * @returns {{writes: object, discarded: string[], removeFromPage: boolean}}
   */
  function planSecretMigration(pageInt, pageAi, pageLegacyAi, stored, site) {
    var writes = {};
    var discarded = [];
    var s = stored || {};

    if (pageInt) {
      if (s[INT_KEY]) discarded.push("integration tokens");
      else writes[INT_KEY] = pageInt;
    }

    // A full ai_config wins over the bare legacy key when both are present.
    var incomingAi = pageAi || pageLegacyAi;
    if (incomingAi) {
      if (s[AI_KEY]) discarded.push("an AI key");
      else writes[AI_KEY] = incomingAi;
    }

    if (discarded.length) {
      // Cap the backlog: a user who visits many stale origins should not grow
      // this list without bound, and only the most recent ones are actionable.
      var prior = Array.isArray(s[NOTICE_KEY]) ? s[NOTICE_KEY].slice(-19) : [];
      prior.push({ site: site || "another site", what: discarded.join(" and ") });
      writes[NOTICE_KEY] = prior;
    }

    return {
      writes: writes,
      discarded: discarded,
      // The page copy always goes: it is either migrated or redundant. Callers
      // must still wait for the write to resolve before deleting, so a failed
      // write cannot destroy the user's only copy.
      removeFromPage: !!(pageInt || pageAi || pageLegacyAi),
    };
  }

  var api = {
    INT_KEY: INT_KEY,
    AI_KEY: AI_KEY,
    NOTICE_KEY: NOTICE_KEY,
    planSecretMigration: planSecretMigration,
  };

  // Published as a global on the content script's isolated world, which is how
  // content-script.js consumes it — and how tests/secret-migration.test.ts
  // loads it (evaluated in a vm sandbox, so the shipped file is what's tested).
  if (root) root.TraceBugSecretMigration = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
