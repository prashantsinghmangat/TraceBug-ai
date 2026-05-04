# Freemium Plan

TraceBug ships a Free / Premium split. The free tier covers the entire bug-reporting workflow end-to-end; the premium tier unlocks polish features (PDF, Jira, unlimited screenshots, advanced metadata, custom branding).

There is **no backend, no auth, no payment integration**. The plan is a local flag persisted to `chrome.storage.local` (extension context) or `localStorage` (web SDK). The "Upgrade" CTA is a placeholder — flip the flag manually for testing via the **dev toggle** in the upgrade modal.

---

## What's free vs premium

| Capability | Free | Premium |
|---|:---:|:---:|
| Start / stop recording | ✅ | ✅ |
| Click / input / navigation capture | ✅ | ✅ |
| Screenshot (full viewport) | ✅ (max 2 per ticket) | ✅ unlimited |
| Region screenshot (snipping tool) | ✅ (counts toward the 2 cap) | ✅ unlimited |
| Notes (text + voice) | ✅ | ✅ |
| Element annotate / draw mode | ✅ | ✅ |
| Generate bug report | ✅ | ✅ |
| Copy report (plain text, GitHub markdown) | ✅ | ✅ |
| Open in GitHub (prefilled URL) | ✅ | ✅ |
| **Jira ticket export** | 🔒 | ✅ |
| **PDF export** | 🔒 | ✅ |
| **Network errors in report** | 🔒 (stripped) | ✅ |
| **Console errors in report** | 🔒 (stripped) | ✅ |
| **Custom branding** (`companyName` in reports) | 🔒 (ignored) | ✅ |

Free users always get a working, complete bug ticket. Gated features show an upgrade modal — they never silently fail.

> **Note on Jira:** the existing Jira flow generates Jira-formatted markdown for clipboard paste; it does not call the Jira REST API. The "Jira API integration" framing in the product spec is gated as the existing markdown export — no auth/backend was added.

---

## Plan API

```ts
import TraceBug, { isPremium, getPlan, setPlan, hydratePlan, FREE_LIMITS } from "tracebug-sdk";

await hydratePlan();        // called automatically at TraceBug.init()
TraceBug.getPlan();         // "free" | "premium"
TraceBug.isPremium();       // boolean
await TraceBug.setPlan("premium");   // dev/test toggle — also persists to storage
TraceBug.FREE_LIMITS;       // { screenshots: 2 }
```

The plan API is also exposed as named exports for callers that don't go through the singleton.

---

## Where the gates live

| Surface | Behavior on free plan |
|---|---|
| `TraceBug.takeScreenshot()` / `takeRegionScreenshot()` | Returns `null` and shows upgrade modal once the cap (2) is reached |
| Toolbar Camera / Region buttons | Same — opens upgrade modal at the cap |
| `TraceBug.downloadPdf()` | No PDF generated; opens upgrade modal |
| `TraceBug.getJiraTicket()` | Returns `null`; opens upgrade modal |
| Quick Bug modal **🔒 Jira Ticket (Premium)** button | Opens upgrade modal instead of copying |
| `TraceBug.generateReport()` / `getGitHubIssue()` | `consoleErrors` and `networkErrors` arrays returned empty; everything else intact |
| `companyName` config option | Ignored — no branding line prepended |

The upgrade modal carries a single placeholder CTA ("Upgrade — Coming Soon") plus a small dev-only toggle that flips the local plan flag.

---

## Custom branding (premium)

```ts
TraceBug.init({
  projectId: "my-app",
  githubRepo: "myorg/myapp",
  companyName: "Acme Inc.",   // premium-only
});
```

When the user is on premium, every export (`getGitHubIssue`, `getJiraTicket`, the Quick Bug modal markdown) gets a prefix line:

```
> _Reported via TraceBug — Acme Inc._
```

On free, the option is silently ignored — the export is unchanged.

---

## UI surfaces

- **Toolbar settings card** — shows a `Free Plan` / `✨ Premium` badge next to the screenshot count. The badge is clickable; clicking it opens the upgrade modal.
- **Ticket-review modal footer** — shows the same badge alongside "Draft auto-saved".
- **Jira button** in the modal — renders as `🔒 Jira Ticket (Premium)` (muted) when free; `🎫 Copy as Jira Ticket` (blue) when premium.
- **Toast on cap hit** — taking a screenshot at the limit replaces the success toast with an upgrade modal.

---

## Testing free vs premium

The freemium model is fully local. Two ways to switch.

### 1. Via the dev toggle (recommended)

1. Click the floating bug button → click the gear/settings icon
2. Click the `Free Plan` badge
3. The upgrade modal opens — click `Dev: enable Premium (test only)`
4. The flag flips and persists. Take more than 2 screenshots, click PDF, click Jira — everything unlocks.

To go back: click the `✨ Premium` badge → `Dev: switch to Free`.

### 2. Programmatically

```js
// In DevTools console on any page where TraceBug is initialized:
await TraceBug.setPlan("premium");
await TraceBug.setPlan("free");
TraceBug.getPlan();        // verify
```

Or directly in storage:

```js
// chrome.storage.local (extension)
chrome.storage.local.set({ tracebug_plan: "premium" });

// localStorage (web SDK)
localStorage.setItem("tracebug_plan", "premium");
```

### What to verify

| Action | Free expected | Premium expected |
|---|---|---|
| Take 3 screenshots in a row | Modal appears on the 3rd; screenshots\[\].length === 2 | All 3 land; screenshots.length === 3 |
| `TraceBug.downloadPdf()` | Upgrade modal opens, no PDF downloads | PDF downloads |
| `TraceBug.getJiraTicket()` | Returns `null`, upgrade modal opens | Returns `{ summary, priority, labels, description }` |
| Quick Bug modal Jira button | 🔒 muted; click opens upgrade modal | 🎫 blue; click copies + downloads screenshots |
| `TraceBug.generateReport().networkErrors` | `[]` (stripped) | populated |
| `TraceBug.generateReport().consoleErrors` | `[]` (stripped) | populated |
| GitHub issue export with `companyName: "Acme"` | No branding line | Prefix `> _Reported via TraceBug — Acme_` |

---

## Why no backend?

The product spec pins this design:

- **No auth** — keeps the install bar at zero. Anyone can drop in the SDK or extension and start filing tickets.
- **No payment** — out of scope for this iteration. The CTA is a placeholder for a future flow.
- **Local flag** — sufficient for validating that the gating boundaries feel right before investing in licensing infrastructure.

When/if a paid flow ships, only `setPlan()` needs a real backend hook — every other surface (gates, modal, badge) stays as-is.
