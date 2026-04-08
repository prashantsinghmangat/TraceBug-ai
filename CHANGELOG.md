# Changelog

All notable changes to TraceBug are documented here.

## [1.2.0] - Unreleased

### Added
- **Theme system** — dark/light/auto themes with CSS custom property design tokens
- **Configurable toolbar position** — right, left, bottom-right, bottom-left
- **Draggable toolbar** — drag to any position, persisted in localStorage
- **Mobile FAB mode** — viewport < 768px collapses toolbar to floating action button
- **First-run onboarding** — 4-step tooltip tour shown once, "?" button to replay
- **Plugin/hook system** — `TraceBug.use()` for plugins, `TraceBug.on()` for lifecycle hooks
- **Console capture levels** — `captureConsole: 'errors' | 'warnings' | 'all' | 'none'`
- **CI/CD helpers** — `getErrorCount()`, `exportSessionJSON()`
- **Tab-based session detail** — Overview, Timeline, Errors, Export tabs
- **Session search & filter** — search by error/URL, filter by errors/healthy
- **Session auto-naming** — sessions named by primary page (e.g., "Login Session")
- **Toast notifications** — visual feedback for actions
- **SEO improvements** — sitemap.xml, robots.txt, JSON-LD structured data, per-page metadata
- **OG image** — PNG via Next.js ImageResponse (replaces SVG that social platforms couldn't render)
- **Security headers** — X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- **OSS infrastructure** — CONTRIBUTING.md, CHANGELOG.md, GitHub issue templates, CI workflow

### Fixed
- **Global error boundary** — SDK init, all collectors, dashboard mount wrapped in try/catch
- **Resilient fetch/XHR wrappers** — original function ALWAYS called even if tracking throws
- **Footer privacy link** — changed from `#` to `/privacy`
- **Docs page metadata** — unique title/description instead of falling back to root layout

### Changed
- All UI components migrated from hardcoded colors to CSS custom properties
- Collectors hardened with try/catch — never break host app event handling

## [1.1.1] - 2026-03-12

### Initial Public Release
- Session recording (clicks, inputs, navigation, API calls, errors)
- Screenshot capture with annotation editor (rectangles, arrows, text)
- Voice bug descriptions via Web Speech API
- Element annotation mode (click elements to attach feedback)
- Draw mode (rectangles/ellipses on live page)
- GitHub Issue and Jira Ticket export (one-click copy)
- PDF report generation
- Auto-generated reproduction steps
- Auto bug title and flow summary
- Environment detection (browser, OS, viewport, device, connection)
- Privacy: passwords, credit cards, SSNs, tokens auto-redacted
- Framework noise filtering (Next.js, Webpack, Vite, Turbopack)
- Chrome Extension (Manifest V3, CSP-safe injection)
- npm package with ESM + CJS + IIFE + TypeScript declarations
