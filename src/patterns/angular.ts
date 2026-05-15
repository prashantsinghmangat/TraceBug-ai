// ── Angular error patterns ────────────────────────────────────────────────
// Includes the official NG0xxx error code catalog where stable.

import { ErrorPattern } from "./index";

export const angularPatterns: ErrorPattern[] = [
  {
    id: "angular-ng0100-expression-changed",
    pattern: /ng0100|expressionchangedafterithasbeenchecked|expression has changed after it was checked/,
    hint: "Angular ExpressionChangedAfterItHasBeenCheckedError — a binding changed during change detection",
    fix: "wrap the side-effect in `setTimeout(...)`, `Promise.resolve().then(...)`, or `ChangeDetectorRef.detectChanges()` after the lifecycle",
    category: "Angular change-detection",
  },
  {
    id: "angular-ng0200-circular-di",
    pattern: /ng0200|circular dependency in di/,
    hint: "circular DI dependency — two providers depend on each other",
    fix: "break the cycle by moving one dependency to a setter, using `forwardRef`, or refactoring shared logic into a third service",
    category: "Angular DI",
  },
  {
    id: "angular-ng0300-multiple-comp",
    pattern: /ng0300|multiple components matched on the same element/,
    hint: "two components have the same selector and matched the same element",
    fix: "rename one component's selector, or restrict it with attribute matching",
    category: "Angular components",
  },
  {
    id: "angular-zone-leak",
    pattern: /zone\.js.*scheduletask|ngzone.*outside/,
    hint: "an async task is running outside Angular's zone — UI may not update",
    fix: "wrap the callback with `ngZone.run(() => ...)` or use `runInsideAngular`",
    category: "Angular zones",
  },
  {
    id: "angular-template-binding",
    pattern: /can't bind to .*since it isn't a known property/,
    hint: "template binds to an unknown property — module/import missing or selector typo",
    fix: "import the FormsModule/CommonModule the directive belongs to, or check the selector spelling",
    category: "Angular templates",
  },
];
