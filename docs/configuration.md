# Configuration

## Init Options

```typescript
TraceBug.init({
  projectId: "my-app",
  maxEvents: 200,
  maxSessions: 50,
  enableDashboard: true,
  enabled: "auto",
});
```

### `projectId` (required)

A string identifier for your app. Used to tag stored session data.

```typescript
TraceBug.init({ projectId: "my-saas-app" });
```

### `maxEvents`

Maximum number of events stored per session. Oldest events are dropped when the limit is exceeded.

- **Default:** `200`
- **Range:** Any positive integer

```typescript
TraceBug.init({ projectId: "my-app", maxEvents: 500 });
```

### `maxSessions`

Maximum number of sessions kept in localStorage. Oldest sessions are pruned when the limit is exceeded.

- **Default:** `50`
- **Range:** Any positive integer

```typescript
TraceBug.init({ projectId: "my-app", maxSessions: 100 });
```

### `enableDashboard`

Controls whether the compact toolbar UI appears on the page.

- **Default:** `true`
- Set to `false` if you want to use TraceBug programmatically without any visible UI

```typescript
// Headless mode — SDK records events but no UI is shown
TraceBug.init({ projectId: "my-app", enableDashboard: false });
```

### `enabled`

Controls when TraceBug is active based on the environment. This prevents TraceBug from running in production by default.

| Value | Behavior |
|-------|----------|
| `"auto"` | Enabled in development and staging, disabled in production (default) |
| `"development"` | Only enabled when `NODE_ENV` is `"development"` |
| `"staging"` | Enabled in dev + staging (hostname contains `staging`, `stg`, `uat`, `qa`) |
| `"all"` | Always enabled, including production (**use with caution**) |
| `"off"` | Completely disabled — SDK does nothing |
| `string[]` | Custom list of allowed hostnames |

#### Auto Detection

With `"auto"` (default), TraceBug detects the environment from:

1. **Vite:** `import.meta.env.MODE`, `import.meta.env.PROD`, `import.meta.env.DEV`
2. **Webpack/Node:** `process.env.NODE_ENV`
3. **Hostname fallback:** `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]` → development

If environment can't be determined, it defaults to **production** (disabled) for safety.

#### Examples

```typescript
// Only in development
TraceBug.init({ projectId: "my-app", enabled: "development" });

// Dev + staging environments
TraceBug.init({ projectId: "my-app", enabled: "staging" });

// Specific hostnames only
TraceBug.init({
  projectId: "my-app",
  enabled: ["localhost", "staging.myapp.com", "qa.myapp.com"],
});

// Force enable everywhere (careful!)
TraceBug.init({ projectId: "my-app", enabled: "all" });

// Completely disable
TraceBug.init({ projectId: "my-app", enabled: "off" });
```

## Session Behavior

- **New session per page load** — Each page load or refresh creates a new session ID
- **No session persistence across tabs** — Each tab has its own session
- **Sessions stored in localStorage** under the key `tracebug_sessions`
- **Automatic pruning** — Oldest sessions are removed when `maxSessions` is exceeded

## Data Storage

| Data | Storage | Limit |
|------|---------|-------|
| Sessions & events | localStorage | `maxSessions` x `maxEvents` |
| Screenshots | In-memory only | 50 per session |
| Voice transcripts | In-memory only | Unlimited |
| Element annotations | In-memory only | Unlimited |
| Draw regions | In-memory only | Unlimited |
| Environment info | localStorage (per session) | 1 per session |

In-memory data persists for the current page session. It's included in generated reports but lost on page refresh.

## Self-Filtering

TraceBug never captures its own UI interactions:

- All TraceBug elements live inside `#tracebug-root`
- Elements use `data-tracebug` attributes for identification
- Event collectors check every event target against TraceBug's DOM tree
- TraceBug clicks, inputs, and form interactions are excluded from the timeline

## Dashboard Z-Index

All TraceBug UI uses `z-index: 2147483647` (maximum 32-bit integer) to stay on top of any page content:

- Root container: `position: fixed`, `overflow: visible`, `pointer-events: none`
- Interactive children: `pointer-events: auto`
- Appended to `<html>` (not `<body>`) to escape all stacking contexts

## Next.js / Dynamic Import

For Next.js apps, use dynamic import to avoid SSR issues:

```typescript
// app/tracebug-init.tsx
"use client";
import { useEffect } from "react";

export default function TraceBugInit() {
  useEffect(() => {
    import("tracebug-sdk").then(({ default: TraceBug }) => {
      TraceBug.init({ projectId: "my-nextjs-app" });
    });
  }, []);
  return null;
}
```

```typescript
// app/layout.tsx
import TraceBugInit from "./tracebug-init";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <TraceBugInit />
      </body>
    </html>
  );
}
```
