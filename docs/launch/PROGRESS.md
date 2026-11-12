# v1.11 launch work - progress log

Add <=5 lines per phase: what changed, files touched, how it was verified, open issues.
Newest entry at the bottom. Keep the last two entries here; move older ones to
`PROGRESS-archive.md` when this file passes ~150 lines. Current state lives in `STATE.md`, not here.

## Website redesign ready on `website-revamp`, not deployed (2026-11-10)

- Midnight coral theme (#FF5C6C), coral prompt logo on site + extension, hero "Capture the bug. Let AI fix it." with Trace chip and traced-paths backdrop, mobile hero trimmed; Features cards no longer overclaim (`358ce36`). Commits `ad44157` (website), `1127f54` (extension icons/popup/welcome).
- Verified: `check.mjs --full` green (1081 tests, 84/84 report checks), `next build` 62/62, production smoke test of 25 routes + homepage links (all 200, 404 page correct), screenshots at 360/390/430/1440 in dark and light.
- Open: the branch also carries unreleased 1.11.6 + 1.12 commits, so merging it to `main` (Netlify deploys `main`) ships the 1.12 script-tag SDK and 1.11.6 docs before the stores. Decide: release first, or cherry-pick the website commits onto `main`.

## Site/extension conversion audit applied on `website-revamp`, uncommitted (2026-11-10)

- Site: shared `InstallButtons` (Firefox visitors get "Add to Firefox" as the filled button; nav, hero, closing CTA, pricing, mascot, /bye); install CTA on 7 dead-end pages; nav cut to 5 links; one header system (`text-h2 font-medium`, sentence case, an `h1` on every page); `/docs` rewritten extension-first; `/features` got a header + install; `/privacy` got nav/footer and a "This website" section. Fixed: dead `#mcp` link on /features, squashed pricing button and clipped MCP commands on phones, faux-bold text (Space Grotesk 600/700 now loaded), changelog hiding `[Unreleased]`. Copy checked against code: Alt+B = screenshot ticket, "Export replay (.html)", nine MCP tools, one `claude mcp add -s user` command, AI key kept in extension storage.
- Extension: in-page UI (`src/theme.ts`, ~20 files, `tracebug-injected-styles.css` mirror) and options/confirm/player/welcome on Midnight coral; `--tb-on-accent` ink text on coral fills; category colours (replay markers, navigate chip, redesign intent, pen palette) kept; popup "Auto" theme now follows the system; two invalid CSS declarations fixed; tooltip "TraceBug: capture a bug"; `homepage_url` → tracebug.dev.
- Verified: `check.mjs --full` green (1081 tests, 84/84 report checks, all surfaces on 1.11.6); website `tsc` + `next lint` clean; 9 routes × 375/768/1280 rendered with no overflow or console errors; popup/options/welcome screenshotted light + dark. Not run: `npm run ext:firefox`, `next build`, the in-page modal in a real tab.
- Open: exported report (`src/exporters/html-template.ts`) still indigo; home-page mobile items left as is (comparison grid scrolls without a hint, integrations orbit crowds at 375, demo poster's play pill overlaps a card at 1280, mascot bubble can cover a heading).

## Release testing for 1.11.6 + 1.12, automated part (2026-11-10)

- On `2555d31` (`website-revamp`, after the coral recolour): `check.mjs --full` green — 1081 tests / 72 files, ext:lint 0 errors / 12 warnings, all surfaces on 1.11.6, report quality 84/84. All 24 `e2e/*.e2e.mjs` suites pass first time (feature-matrix 64/64, provider-confirm 61/61, secret-migration 25/25 after recreating `git worktree add --detach D:/tmp/tb-1101 v1.10.1`); ext-player-csp verdict OK. `benchmark.mjs`: init 10.9 ms, ~31 µs per interaction, export 112 KB.
- MCP vs the 2026-07-28 spec (stateless, `server/discover`): our server answers `server/discover` with -32601, which dual-era clients treat as "legacy, fall back to initialize"; fallback init, tools/list (9) and list_bug_reports all work. Modern-only clients would fail — adding `server/discover` is a follow-up, not a blocker.
- Not run (needs a person): `npm run ext:firefox`, ticket modal in a real tab, toolbar Record in Chrome Tab mode, RELEASE_CHECKLIST manual rows.
- Also: `docs/audit-quality/implementation-plan.md` (new, uncommitted) — Site Audit + verified-fix sprint plan; four blockers to decide before code.

## Website pre-deploy check + canonical fix (2026-11-11)

- Live tracebug.dev = `main` tip (coral, InstallButtons, no Discussions link); live changelog tops at 1.11.5. 15 pages at 375 px and 7 at 1280 px: no horizontal scroll, broken images or console errors. Headers: HSTS, nosniff, XFO, referrer; no site-wide CSP; `/_next/image` 404; `npm audit` = the deferred Next 14 advisories + build-time postcss.
- **Fixed:** 17 pages (pricing, blog, docs/mcp, docs/playwright, docs/ai-debugger, docs/har-export, 12 × compare, changelog, privacy) inherited `canonical: "/"` from `app/layout.tsx` (since 2026-06-15), telling Google they duplicate the homepage. Each now sets its own `alternates.canonical`. Verified: tsc + next lint clean; dev server renders the right canonical on all 15 sampled routes, homepage unchanged.
- Open (minor): descriptions 180–280 chars, ~20 titles > 65 chars, no og:image on docs/compare pages, `/sdk-bridge` still served.

## 1.11.6 hand-test fixes (2026-11-11)

- From the user's hand test of the 1.11.6 zip on a real page: (1) exported `.html` was still indigo with a 🐞 logo → coral tokens in `html-template.ts` (light #C81E3C / dark #FF5C6C, `--tb-on-accent` ink on coral fills), prompt-logo SVG inline; replay marker colours kept. (2) Prompt + export AI tab said `claude mcp add tracebug` → one `CLAUDE_MCP_ADD` in `agent-workflow.ts` used by prompt, export and hand-off card (Playwright reporter keeps its `--dir`). (3) GitHub/Jira copy and Linear/Slack/GitHub filing printed the untouched auto-description above the full body → `filingDescription()` drops it, `composeGitHubIssueMarkdown()`. (4) AI prompt "recent successful calls" listed JS/CSS/image loads → `isStaticResource` filter. (5) "cloud link" copy removed.
- Files: src/exporters/{html-template,agent-workflow,ai-prompt}.ts, src/ui/quick-bug.ts, CHANGELOG, tests/export-consistency.test.ts (new, 10). Verified: `check.mjs --full` 1091/73, 84/84; e2e shipping-path 16/16, github-send-confirm 9/9, provider-confirm 61/61, feature-matrix 64/64, player-csp OK; a generated export viewed light + dark. Zips rebuilt (628 KB, 30 files, permissions unchanged).

## Theme-token fix + coral store images (2026-11-11)

- **Bug found while regenerating screenshots:** since 1.11.3 (`93a97a3`) `init()` applied the theme before `mountDashboard()` created `#tracebug-root`, so `data-tb-theme` was never set and no `--tb-*` token reached the in-page UI — the ticket's More menu rendered transparent over the panel, and the UI ran on hard-coded dark fallbacks whatever the setting. Fix: `applyThemeToRoot()` in `theme.ts`, called by `mountDashboard()` after the root is appended. In-page UI now follows its theme setting (default light; the ticket's toggle switches). `tests/theme-mount.test.ts` (2). Gates 1097/75, 84/84; e2e style-nonce 7/7, trusted-types 9/9, shipping-path 16/16, feature-matrix 64/64, sdk-isolation 17/17, badge-defer 4/4, inspect 8/8, pre-record 11/11, milestone 5/5; verified light + dark on try.html.
- Store images regenerated in coral (gitignored `assets/`; old set in `assets/archive/store-pre-coral-2026-11-11/`): 5 Chrome + 6 AMO screenshots, 2 promo tiles, welcome shots; `frame.css`/slides recoloured, new logo, slide 3 shows the real setup command, slide 5 card fits the crop, AMO record slide uses a true Firefox-layout popup (new `popup-record-firefox.png` in `e2e/marketing-screenshots.mjs`). STORE-LISTINGS descriptions: bare `npx tracebug mcp` → the `claude mcp add -s user …` command.
- Open: AMO slide/caption say "Record a tab, window or screen" — Firefox's picker may not offer single tabs; check in Firefox.

## Website: annotate illustration, OverlayQA findings, blog SEO (2026-11-11)

- `FeatureTabs.tsx`: the "Annotate and blur" marks were absolutely positioned by pixel and had drifted (box below the button, blur across the email row). They are now children of what they mark (`Checkout annotated`: ring on the button, blur on the card number), so they cannot drift.
- OverlayQA auto-review (80/100, 4 findings): logo link got `hover:opacity-80 active:opacity-60` (`Navbar.tsx`); the hero's Replay/step buttons got `active:` feedback (`HeroStory.tsx`). The two "font failed to load" findings are next/font's `local("Arial")` metric fallbacks, which load on any machine with Arial — left unchanged (tried `adjustFontFallback: false` on mono, it altered the font stack, reverted).
- Blog: `BlogPost` gained `seoTitle`, `seoDescription`, `updated`, `faq`; the post page emits Article (+dateModified, publisher) + BreadcrumbList + FAQPage JSON-LD, shows the FAQ and "updated" date; sitemap uses `updated`. Two posts reworked (bug-report template, Claude Code browser context): short-answer lead, FAQ, internal links, titles ≤ 63 / descriptions ≤ 160 chars; stale `claude mcp add tracebug` fixed in two posts.
- Verified: website tsc + next lint clean; dev server: illustration aligned, both posts 200 with 3 schema types and FAQ rendered, no console errors. Not run: `next build`.

## Release sheet generator (2026-11-11)

- `scripts/release-sheet.mjs` writes `docs/release-sheets/<version>.md`: one copy-and-paste page per release in upload order (files + status, Chrome title/summary/description/screenshots/privacy answers, AMO release notes/reviewer notes/description/captions, npm, MCP registry, merge + tag, GitHub release notes, post-release checks). Assembled from package.json, the manifests, STORE-LISTINGS.md (found by its bold labels) and CHANGELOG.md; permission changes are diffed against the previous tag. Refuses to run on a version mismatch; warns if the "New in" paragraph is for another version.
- STORE-LISTINGS.md is now current for 1.11.6 ("New in 1.11.6" paragraph, Firefox release notes). RELEASING.md points at the sheet. `docs/release-sheets/1.11.6.md` generated (469 lines, every file "ready"). Lint gate green.
- 2026-11-12: **npm (`tracebug-sdk`, `tracebug`) and MCP Registry are live on 1.11.6** (`isLatest`, `bin` OK); stores pending. RELEASING.md §5/§6 and the release sheet now carry what this run hit: PowerShell `& C:\tools\mcp-publisher.exe` from `packages\tracebug`, wait for "Successfully logged in", 401 "token is expired" → log in again, `curl.exe` in PowerShell, `E404 No match found` right after `npm publish` is propagation (check `dist-tags`). `server.json` `--dir` text corrected (shows on the registry at the next publish).
- 2026-11-12: **Marketing images in coral.** `assets/banners/social-1.11.6/` (OG, X/LinkedIn, square, dev.to: headline "Bug reports your AI can actually trust.", real logo, current popup + HUD), YouTube channel banner, profile, watermark and video thumbnail regenerated. Generators recoloured (`assets/source/banners/banners.mjs` now versioned from package.json, uses the extension icon and Space Grotesk, never writes into the website; `youtube/poster.mjs` reads its frames from `assets/source/youtube/frames/` instead of an old scratchpad). Old set in `assets/archive/banners-pre-coral-2026-11-12/`. Logo was already coral on every shipped surface.
- 2026-11-12: `website/public/try.html` (the live sandbox) moved from Slate Indigo to Midnight coral: real logo mark, coral back link/banner/focus ring; the Acme shop under test is neutral ink (product renamed "— Midnight"). e2e milestone-ask 5/5, inspect-mode 8/8, blur-tracking 7/7, ext-redaction 4/4, no-offscreen-focus 6/6, github-send-confirm 9/9; checked in the browser with the in-page demo running. Store screenshots were taken from the old sandbox shop (indigo button inside the captured page) — regenerate them if the shop should look current.
- 2026-11-12: Store screenshots (5 Chrome, 6 AMO) and both promo tiles regenerated after the try.html recolour, so the shop inside the captures is the new neutral one. Release sheet regenerated: 0 files missing.
- 2026-11-12: Token hygiene: STATE.md rewritten 218 → 63 lines (current facts + gotchas; history stays in PROGRESS); CODEMAP gained scanner, MCP server, prompts, theme, release and marketing entries; phase skill points at the audit plan; CLAUDE.md states the STATE.md size rule.

## Site Audit Phase B, step 1: types, fingerprints, run builder, compare (2026-11-12, branch `site-audit`)

- `src/types.ts`: `AuditCategory`, `AuditEvidence`, `AuditRun`; `Issue` gains optional `category`, `ruleId`, `evidence`, `fallbackFingerprint` (the existing `fingerprint` field is reused for audit findings). New `src/audit/`: `fingerprint.ts` (sync FNV-1a `stableHash`, `normalizeSelector` drops generated ids/classes and sorts attrs, `auditFingerprint` / `auditFallbackFingerprint`), `run.ts` (`buildAuditRun`: redact + bound evidence, dedupe into `occurrences`, severity sort, cap 200 + `truncated`, categories with `ran`/`limitation`), `compare.ts` (`compareAudits`: fixed / stillPresent (fingerprint, then fallback) / new / regressed; skips categories not run in both; refuses different pages).
- Plan deviation: `fallbackFingerprint` added (plan named the fallback but not where it lives); `fingerprint` reused rather than a new field. Nothing wired yet: no detector, UI, export or MCP uses `src/audit/` — that is step 2+.
- Verified: `tests/audit-core.test.ts` 26/26; `check.mjs` 1124/77, typecheck, lint, build green. Bundles unchanged (module not imported yet).

## Site Audit Phase B, step 2a: audit engine — a11y, UI, SEO, runtime + runAudit() (2026-11-12, `site-audit`)

- `src/audit/detectors/`: `a11y.ts` (axe WCAG 2.0–2.2 A/AA, one finding per element ≤20/rule, contrast metrics; axe from bundle or `window.axe`, else "did not run"), `ui.ts` (horizontal-overflow + off-screen culprits, overlap, text-clipped, img-no-dimensions, broken-image; tap targets left to axe `target-size`), `seo.ts` (title/description presence+length, canonical none/multiple, h1 none/multiple, noindex, viewport; lang/alt left to axe), `evidence.ts`. `src/audit/index.ts` `runAudit()` (+ runtime findings from the capture). SDK: `TraceBug.runAudit()`, `getLastAudit()`, `compareAudits()`. New detectors `audit-ui`, `audit-seo`.
- Verified: `tests/audit-seo.test.ts` 9/9; new `e2e/site-audit.e2e.mjs` 33/33 (planted defects in all categories found, compare reports 5 fixed + 1 regression, no token/query leak, stable fingerprints) — added to `check.mjs --full` as `e2e:audit`. A clean page audits to 0 findings in every category. `check.mjs --full` 1133/78, ext:lint 0/12, 84/84. Extension bundle +30 KB (no axe).
- Next: 2b — packaged axe file injected on "Run audit", popup button, issues panel by category.

## Site Audit Phase B, step 2b: "Audit" in the extension (2026-11-12, `site-audit`)

- axe-core 4.11.4 `axe.min.js` copied unmodified by `build-ext.mjs` into each build as `vendor/axe.min.js` (+ gitignored `tracebug-extension/vendor/` for unpacked/e2e). Worker `injectAxe()` puts it in the page MAIN world only on `TB_RUN_AUDIT`; popup dock gains **Audit** (`btnAudit`); content-script → `tracebug-init.js` "audit" → SDK `showAuditPanel()`. New `src/ui/audit-panel.ts`: category cards (ran / not run + limitation), findings by category, Locate, "How to fix", **Re-run audit** shows fixed / still present / regressed / new. No manifest change.
- Verified: new `e2e/ext-site-audit.e2e.mjs` 18/18 on the packaged `dist/chrome` (axe absent before, injected on demand, a11y runs in the extension, re-run diff, Esc, strict-CSP page with no eval still audits) → gate `e2e:audit-ext`; `e2e:audit` 33/33; panel checked light + dark on try.html. **ext:lint FAILS: 22 warnings vs baseline 12** — all 10 new are `vendor/axe.min.js` (9 DANGEROUS_EVAL, 1 UNSAFE_VAR_ASSIGNMENT), inherent to axe; baseline left for the user to approve.
- Before the release that ships the audit: AMO reviewer note naming axe-core 4.11.4 (MPL-2.0, unmodified, sha256 fb83a4378d978ecb7d2dae48a3a3778a84c971ac692f3afd45d714fba89c0f0d); zip grows ~560 KB.
- 2026-11-12: ext:lint baseline 12 → 22 (`scripts/check-baseline.json`), approved by the user: the 10 new warnings are all axe-core's own code in `vendor/axe.min.js`.


## Site Audit Phase B, step 3: performance, export, MCP tools (2026-11-12, `site-audit`)

- `src/audit/detectors/performance.ts` (TTFB/FCP/LCP/CLS graded on web.dev thresholds, page weight, ≥500 KB files, render-blocking files; category `metrics`, honest lab-only limitation). `src/audit/export.ts` + panel **Export report** + SDK `exportAudit()` → `payload.audit`; viewer Audit tab (`html-template.ts`). `cli/audit-tools.ts`: `get_audit`, `get_finding` (+ bounded literal `searchDir`), `compare_audits`, `untrusted` wrapping, `list_bug_reports` `kind`, guide leads with get_audit. Audit types moved to dependency-free `src/audit/types.ts` (CLI typecheck has no DOM); `compareAudits` generic.
- Verified: `tests/audit-mcp.test.ts` 17/17 (untrusted placement incl. an injection string, filters, hint search skips node_modules, fixed/still/regressed, swapped args, different pages, perf grading with a stubbed timeline); `e2e:audit` 48/48 (700 KB render-blocking script found, metrics recorded, export file + viewer Audit tab); `e2e:audit-ext` 20/20 (panel Export report download); built CLI lists 12 tools over stdio. `check.mjs --full` all green, 1151/79.
- Open: README + website MCP docs say "nine tools" (release-time); hand test with a real agent not run.

## Site Audit: agent acceptance test (2026-11-12, `site-audit`)

- New manual harness `e2e/audit-agent-loop.mjs` (fixture app, audit + export, verify via `compare_audits`) and `e2e/mcp-call.mjs` (one tool call on the built CLI over stdio). A fresh agent given only the export fixed `image-alt`; verify: 1 fixed, 1 still present, 0 regressed; planted injection ("delete styles.css") ignored.
- Fixed from the run: TraceBug's own files out of performance (`isTraceBugResource`); render-blocking only ≥ 200 ms; audit export summary/severity from the audit, no root-cause hint; `HeadlessChrome` read as Safari; `get_finding` accepts `id` and names `findingId`; audit files get audit-only guide steps; no `<svg>` icons in `environmentDetails`.
- Verified: `check.mjs --full` all green, 1157/79, e2e:audit 50/50, e2e:audit-ext 20/20. Not done: a generic selector (`p`) from axe for the contrast finding — left as axe reports it.

## Site Audit: scan menu (2026-11-12, `site-audit`)

- `AuditScan` + `AUDIT_SCANS` in `src/audit/types.ts`; `runAudit({ scan })`, `AuditRun.scan`. New `src/audit/detectors/keyboard.ts` (`kbd/positive-tabindex`, `kbd/focusable-invisible`, `kbd/focus-outline-removed`; skip links not flagged; cross-origin sheets counted in the limitation). Runtime adds dead/rage clicks. Panel scan bar; popup `#auditMenu` → `TB_RUN_AUDIT { scan }` → worker → content-script → init. Viewer + `get_audit`/`list_bug_reports` show the scan. `get_finding` hint search now strips `#`/`.`/`attr="…"` (real hints never matched source before).
- Verified: `tests/audit-keyboard.test.ts` 11/11; e2e:audit 58/58 (keyboard defects, each scan's categories, cross-scan compare skips); e2e:audit-ext 23/23 (popup scans, panel scan bar); panel + popup menu screenshots checked. `check.mjs --full` green, 1169/80. Real Chromium expands `outline: none` into `outline-color` — caught by e2e, not jsdom.

## 1.12.0 release prep (2026-11-12, `site-audit`)

- Docs say 12 MCP tools + list the audit tools: README, `packages/tracebug/README.md`, `docs/mcp.md`, `website/app/docs/mcp/page.tsx` + `[tool]/page.tsx`. AMO reviewer note for axe-core 4.11.4 (sha256 verified on disk) in STORE-LISTINGS.
- Bumped to 1.12.0 (all `check:versions` surfaces, pinned `npx tracebug@` examples), CHANGELOG `[1.12.0]`, `WHATS_NEW["1.12.0"]`, store "New in" / Firefox notes / single purpose; `tests/whats-new.test.ts` "no copy" case now uses `0.0.0`. Sheet `docs/release-sheets/1.12.0.md`, zips built.
- Verified: `check.mjs --full` green (1169/80, ext:lint 0/22, 84/84, 58/58, 23/23, all surfaces on 1.12.0); website `tsc` clean; `/docs/mcp` and `/docs/mcp/cursor` checked in the dev server. Not run: `npm run ext:firefox`.
- Open: `package-lock.json` root version not bumped; CHANGELOG date to fix on release day; Chrome description body has no Site Audit section.

## Audit: keyboard false positive vs OverlayQA (2026-11-12, `site-audit`)

- `kbd/focusable-invisible` flagged buttons inside a `display:none` parent (tracebug.dev's `md:hidden` mobile nav at 1422px). `keyboard.ts` `isRendered()` (checkVisibility, ancestor-walk fallback) + test in `tests/audit-keyboard.test.ts`.
- Verified: `check.mjs --full` green (1170/80, 58/58, 23/23); on localhost:3001 at 1422px the scan now reports only the 2 real contrast findings. Found: below-the-fold content at opacity 0 (scroll reveal) is skipped by axe without saying so; axe's experimental `label-content-name-mismatch` catches OverlayQA's two WCAG 2.5.3 findings.

## Audit: score, docked panel, five a11y gaps (2026-11-12, `site-audit`)

- Score (`src/audit/score.ts`, stored in `AuditRun.score` from all findings), WCAG criteria (`wcag.ts`), fix text (`fixes.ts`; contrast suggestion `contrast.ts` — `#b45309`→`#ad5009`, same as OverlayQA), axe label-in-name, `kbd/focus-obscured`, transparent-text count + "Scroll the page and re-run". Panel rewritten as a docked side panel (Locate keeps it open), toolbar Audit button + `TB_LOAD_AXE` bridge. MCP `get_audit.score`, `get_finding.wcag`/`untrusted.fix`; viewer shows score/WCAG/fix.
- Verified: `check.mjs --full` green (1195/81, 84/84, 65/65 incl. a scroll-reveal fixture, 33/33 incl. Locate + toolbar path); headless screenshots on localhost:3001 at 1422×650, light + dark. Not run: `npm run ext:firefox`.

## Audit: noise cut, OverlayQA-style panel, Copy for AI (2026-11-12, `site-audit`)

- Ran the full audit on 10 public sites (tracebug.dev, GitHub, Stripe, Wikipedia, BBC, Vercel, MDN, HN, gov.uk, Shopify): findings 260 → 129. Dropped: sr-only/skip-link "text cut off", custom-checkbox "invisible focus", Tailwind ring + `:focus:not(:focus-visible)` outline false alarms (cross-rule check), card-link label-in-name, overlaps that still get clicks (hit-test; was random off-screen), CSS-sized images, dev-server bundle sizes. Score now multiplicative (gov.uk 94–100, HN 24, never a flat 0). a11y metrics: rules passed/checked, WCAG criteria failed.
- Panel rewritten (score header, WCAG-failures badge, severity/category filters, grouped findings with Found/Required, footer Export + Copy for AI). `src/audit/prompt.ts`; viewer severities High/Medium/Low. e2e audit fixture served as shop.example (host mapping).
- Verified: `check.mjs --full` green (1200/81, 84/84, 66/66, 33/33); headless screenshots light/dark. Not run: `npm run ext:firefox`.

## Audit vs OverlayQA on tracebug.dev, finding by finding (2026-11-12, `site-audit`)

- Same: contrast ×2 (light theme), label-in-name ×2, fixed header. Theirs, not ours by design: skip link (axe `bypass` passes — `<main>` satisfies 2.4.1), :hover/:active "design debt" (one was on TraceBug's own toolbar), 11 component "variants" (class-name grouping: `rise`, `tabular-nums`, sections, CTA vs inline links). Our export lacked contrast because the local site was in dark theme — now said in the limitation (`pageColorScheme`).
- Bug fixed: runtime findings came from the latest session even when it was on another page (a /try.html TypeError and dead click reported on /). `sessionForThisPage` in `src/audit/index.ts` + test. Gates green (1202/81, 66/66, 33/33).

## Audit: four SEO/perf checks from a 4-tool comparison (2026-11-12, `site-audit`)

- Compared Rank Math, Seobility, SEOptimer, DotPlus on tracebug.dev against the live page: all four wrongly flag `alt=""` avatars; DotPlus wrongly reports 10 render-blocking scripts and no HTTP/2. Added: social tags, JSON-LD validity, robots.txt blocking (critical) + sitemap (`detectCrawlFindings`, skipped on dev hosts), image oversize (≥4× pixels at ≥2× density, ≥50 KB) and format (JPEG/PNG ≥100 KB by real content type).
- Noise study: new findings only where true (HN/BBC/Wikipedia lack og tags; GitHub retina images and Shopify CDN images no longer flagged). Gates green (1212/81, 84/84, 68/68 incl. robots.txt fixture, 33/33).

## Audit: "Needs a person to check" + 5 more a11y reports compared (2026-11-12, `site-audit`)

- Compared ratemysite (Lighthouse), ratedwithai, accessibilityscore.in, Accessibility Analyzer (.xlsx), accessibilitychecker.org on tracebug.dev. Ours = careful tools (label-in-name ×2, contrast ×2 light theme, focus-obscured). Analyzer's rel/blank-button/tabpanel/figcaption/section errors are false; ratemysite's "0/15 AI bots allowed" is false (robots.txt allows all). accessibilitychecker's scrollable `pre` is real at 390px only (we audit the current width).
- Added axe incomplete → `AuditRun.review` (a11y.ts `reviewItems`, run.ts `boundReview`), panel collapsed section, viewer, MCP `needsReview`. resultTypes now includes "incomplete". Live: contrast ×50, aria-prohibited-attr ×3, score unchanged. Gates green (1214/81, 84/84, 70/70, 33/33).

## Audit: phone-width check (2026-11-12, `site-audit`)

- New category `mobile`: page reloaded in a hidden same-site 390×844 iframe; ui.ts layout checks (now take a `doc`) + `mobile/scroll-not-focusable`; only what the current width doesn't already report. Not run (with reason) when framing is forbidden (GitHub, MDN) or the window is already phone-sized. Fixed `isRendered`: opacity-0 ancestors (Shopify's closed mega-menu gave 4 false overlaps).
- Live tracebug.dev from a 1440px window: the two code blocks accessibilitychecker.org reported at mobile. Ten-site study: no other phone-width findings. Gates green (1217/81, 84/84, 74/74 incl. /phone fixture, 33/33).

## Website: llms.txt (2026-11-12, `site-audit`)

- Lighthouse "Agentic Browsing" failed llms.txt: /llms.txt was a 404 whose page took ~3 s, so the fetch timed out. Added `website/public/llms.txt` (H1, summary, Docs/Product/Optional link lists). Verified on the dev server: 200 text/plain in 7 ms; all 18 linked pages 200. Live only after the website deploy.

## Audit: Copy for AI accuracy from a real tracebug.dev prompt (2026-11-12, `site-audit`)

- LCP finding now names the element and tells late render/animation (tracebug.dev: SVG "Checkout" drawn ~11 s after first paint) from a slow image, with matching fix (`describeLcp`). Label-in-name quotes the first rendered line ("Play demo", not "Play demo0:57") and suggests an aria-label. Scroll-box fix gets a fitting label (`scrollBoxLabel`: Code example / Table / placeholder) and says "At 390px wide".
- Verified by regenerating the prompt from live tracebug.dev at 1707×811. Gates green (1219/81, 84/84, 74/74, 33/33).

## Website: fixed what our own audit found (2026-11-12, `site-audit`)

- Hero.tsx / DemoVideo.tsx aria-labels start with the visible text; Keycap.tsx drops aria-label on a span; AgentHandoff `pre` and Comparison grid get tabIndex/role=region/aria-label; globals.css `html { scroll-padding-top: 72px }`, light `--error` #D32424 and `--warning` #A84E08 (4.7:1 on their tints); layout.tsx description 232 → 152 chars; HeroStory restarts its CSS animations in place instead of re-mounting (the re-mount made LCP ~12 s).
- Verified on localhost:3001 at 1707×811, light theme, after two animation loops: full audit 100 in every category, 0 findings, LCP 504 ms, only "needs review" contrast over gradients left; hero loop restarts (clock 9.75 s → 1.4 s). Website tsc + lint clean. Live check after deploy.

## Audit: draggable panel, Audit first in the popup (2026-11-12, `site-audit`)

- audit-panel.ts: header drag (pointer events, 4px threshold, clamped to the window), dock "free:x,y" in localStorage, snap to left/right within 24px, dock button re-docks. popup.html/js/styles.css: "Audit this page" hero card first (main = All checks, chevron #btnAudit = scan menu with icons), then Screenshot, then Capture Bug; dock is Tickets + Inspect; setBusy covers the audit buttons.
- e2e: real mouse drags (float + snap left), popup order and icons. Gates green (1219/81, 84/84, 76/76, 35/35); ext-sdk-isolation 17/17. Store screenshots need regenerating for the new popup.

## 2026-11-12 — Site Audit docs + agent brief; popup card polish
- New docs/site-audit.md (user guide) and docs/AGENT-BRIEF.md (one page for other agents: features, 12 MCP tools, rules, map). Site Audit added to README (flow, Features, API, extension, docs list), docs/README index, api-reference, chrome-extension (popup order), architecture (audit module), mcp.md (get_audit: mobile + needsReview), llms.txt.
- Website: home FeatureTabs "Audit the page" tab (mock score pooled consistently, 61), /docs "Audit a page" section, /features cell replaces the stale "scanner not in extension" text, features description 151 chars.
- styles.css: Audit card chevron keeps the accent tint + rounded corners; option panels flush (-20px = flex gap + card margin).
- Verified: check.mjs green (1219/81), check.mjs --full green before the docs pass, website tsc + lint clean, screenshots of the new tab/section. Lighthouse score calibration runs in a separate session.

## 2026-11-12 — Audit scores calibrated against Lighthouse 12.8 (10 public sites)
- New `perf/blocking` (Total Blocking Time, Lighthouse method; load only: first paint → 5 s after load / first click / audit start; TraceBug's own startup task excluded; Chromium only). `perf/cls` is now the worst session window (web-vitals), not the visit's sum. Files: src/audit/detectors/performance.ts, index.ts, fixes.ts, score.ts (comment), tests/audit-score.test.ts (+7), e2e/audit-noise.mjs (wheel scroll after 5.5 s).
- Results: TBT verdict matches Lighthouse on 9/10 (MDN missed); Shopify CLS 0.577 → 0, BBC LCP 5.9 s → 0.65 s (study artifact). Accessibility: no false positives; gap is weighting (Lighthouse fixed points per rule) + scroll-revealed content + rules LH skips. No formula change.
- Verified: check.mjs --full green (1226/81, 76/76 audit, 35/35 ext audit).
