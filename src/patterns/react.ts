// ── React-specific error patterns ─────────────────────────────────────────
// Covers React 16 → 18 error codes, hooks rules, hydration, key warnings,
// and common stale-closure / infinite-render messages.

import { ErrorPattern } from "./index";

export const reactPatterns: ErrorPattern[] = [
  {
    id: "react-hydration-mismatch",
    pattern: /(hydration|hydrating|did not match|server html)/,
    hint: "looks like an SSR hydration mismatch — server HTML doesn't match what the client wants to render",
    fix: "remove non-deterministic values during render (Date.now, random, window) or wrap them in useEffect/Client-only",
    category: "React SSR",
  },
  {
    id: "react-hook-rules",
    pattern: /(invalid hook call|hook called outside|hooks can only be called)/,
    hint: "violates Rules of Hooks — a hook is being called conditionally or outside a React function component",
    fix: "move the hook call to the top level of a component or custom hook; never inside a conditional or loop",
    category: "React hooks",
  },
  {
    id: "react-stale-closure",
    pattern: /(state.*not.*update|setstate.*unmount|warning.*update.*unmounted)/,
    hint: "looks like a setState on an unmounted component — usually a stale closure or missing cleanup",
    fix: "return a cleanup function from useEffect, or guard with `if (mounted)` before calling setState",
    category: "React lifecycle",
  },
  {
    id: "react-key-collision",
    pattern: /each child.*should have a unique.*key|encountered two children with the same key/,
    hint: "duplicate or missing `key` prop on a list — React can't reconcile children correctly",
    fix: "use a stable unique id (not array index) for each list item's `key`",
    category: "React keys",
  },
  {
    id: "react-too-many-rerenders",
    pattern: /(too many re-renders|maximum update depth)/,
    hint: "infinite render loop — usually setState called unconditionally inside the render body",
    fix: "wrap the setState in a useEffect with proper deps, or check the condition before calling it",
    category: "React render loop",
  },
  {
    id: "react-controlled-uncontrolled",
    pattern: /changing an? (controlled|uncontrolled) input/,
    hint: "input switched between controlled and uncontrolled — `value` was undefined initially",
    fix: 'initialize the value to "" or null instead of undefined; never let it become undefined later',
    category: "React forms",
  },
  {
    id: "react-context-default",
    pattern: /(usecontext.*returned undefined|context value is undefined)/,
    hint: "useContext returned undefined — the component isn't wrapped in the matching Provider",
    fix: "wrap the tree with `<MyContext.Provider value={...}>` or initialize the context with a non-undefined default",
    category: "React context",
  },
  {
    id: "react-suspense-boundary",
    pattern: /(suspense.*not allowed|render.*suspended.*outside.*suspense)/,
    hint: "a component suspended outside a <Suspense> boundary",
    fix: "wrap the suspending component (lazy, useTransition, etc.) in `<Suspense fallback={...}>`",
    category: "React Suspense",
  },
  {
    id: "react-dev-build",
    pattern: /(react is in development mode|react dev tools)/,
    hint: "running React in development mode in production — performance and bundle-size penalty",
    fix: "rebuild with `NODE_ENV=production` and use the production React build",
    category: "React build",
  },
  {
    id: "react-data-loading",
    pattern: /cannot read prop.*of undefined.*\.map|undefined is not iterable.*\.map/,
    hint: "looks like a render before async data arrived — calling `.map` on undefined",
    fix: "add `if (!data) return null` guard, or initialize state to `[]` so .map is safe",
    category: "React data-loading",
  },
];
