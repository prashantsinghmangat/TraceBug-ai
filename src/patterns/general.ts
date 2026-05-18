// ── General JS / DOM error patterns ────────────────────────────────────
// Catch-all category — matches generic error shapes that aren't framework
// or system-specific.

import { ErrorPattern } from "./index";

export const generalPatterns: ErrorPattern[] = [
  {
    id: "general-undefined-access",
    pattern: /(cannot read prop|cannot read properties|of undefined|of null)/,
    hint: "reading a property of undefined/null — usually missing data, async race, or destructuring a missing return",
    fix: "add a null-check, use optional chaining (`obj?.prop`), or initialize state with a safe default",
    category: "JS undefined access",
  },
  {
    id: "general-not-a-function",
    pattern: /is not a function|is not callable/,
    hint: "called something that isn't callable — wrong import shape or a typo on the value",
    fix: "verify the import statement (default vs named), and confirm the value's type matches",
    category: "JS type",
  },
  {
    id: "general-not-defined",
    pattern: /(is not defined|reference.*not.*defined|is not a constructor)/,
    hint: "missing variable/import, or a stale build referencing a removed export",
    fix: "check imports + spelling; clear the build cache (`rm -rf .next`, `dist`, etc.) and rebuild",
    category: "JS reference",
  },
  {
    id: "general-readonly-assign",
    pattern: /(cannot assign to read only|cannot set prop|getter only|read.?only property)/,
    hint: "writing to a frozen, sealed, or getter-only object",
    fix: "clone the object before mutating, or check whether you should be calling a setter instead",
    category: "JS object",
  },
  {
    id: "general-stack-overflow",
    pattern: /maximum call stack|stack size exceeded|stack overflow/,
    hint: "infinite recursion or a render loop",
    fix: "check the function for a missing base case; in React, look for setState during render",
    category: "JS recursion",
  },
  {
    id: "general-syntax-parse",
    pattern: /(unexpected token|unexpected end of|syntaxerror)/,
    hint: "syntax error or malformed JSON in the response",
    fix: "log the raw response text; common causes are HTML error pages returned where JSON was expected",
    category: "JS syntax",
  },
  {
    id: "general-quota-exceeded",
    pattern: /(quota.*exceeded|exceeded.*limit)/,
    hint: "a rate or storage limit was hit",
    fix: "check the request rate; throttle or backoff; verify storage size before writing",
    category: "JS quota",
  },
  {
    id: "general-permission",
    pattern: /(permission denied|notallowederror|not allowed|denied by user)/,
    hint: "an API was denied — usually camera/mic/clipboard/notifications permission",
    fix: "request the permission via a user gesture and provide a fallback if denied",
    category: "JS permissions",
  },
  {
    id: "general-circular-json",
    pattern: /(converting circular structure|circular.*json)/,
    hint: "JSON.stringify hit a circular reference",
    fix: "use a replacer that breaks cycles, or extract just the fields you need before stringifying",
    category: "JS serialization",
  },
  {
    id: "general-dom-not-found",
    pattern: /(cannot read.*null.*\.querySelector|null is not an object.*querySelector|no element.*found)/,
    hint: "DOM query returned null — element not in the tree yet, or selector is wrong",
    fix: "wait for the DOM to mount (useEffect / DOMContentLoaded), or fix the selector",
    category: "DOM lookup",
  },
];
