// ── Vue 2/3 error patterns ────────────────────────────────────────────────

import { ErrorPattern } from "./index";

export const vuePatterns: ErrorPattern[] = [
  {
    id: "vue-missing-key",
    pattern: /v-for.*should have.*key|elements with.*v-for.*key/,
    hint: "list rendering without `:key` — Vue can't track items efficiently",
    fix: "add `:key=\"item.id\"` to the v-for element using a stable unique identifier",
    category: "Vue keys",
  },
  {
    id: "vue-mutate-prop",
    pattern: /avoid mutating a prop directly|mutating a prop directly/,
    hint: "mutating a prop directly — Vue will overwrite your changes on the next parent render",
    fix: "emit an event to the parent or use a local data/ref initialized from the prop",
    category: "Vue props",
  },
  {
    id: "vue-non-reactive",
    pattern: /(reactive.*lost|reactivity.*lost|destructur.*reactivity)/,
    hint: "reactivity lost — likely from destructuring a reactive object",
    fix: "use `toRefs()` when destructuring, or access properties on the proxy (state.x) directly",
    category: "Vue reactivity",
  },
  {
    id: "vue-unknown-component",
    pattern: /unknown custom element|failed to resolve component/,
    hint: "Vue couldn't resolve a component — missing import or registration",
    fix: "import and register the component in the parent's `components` option, or use a global registration",
    category: "Vue components",
  },
  {
    id: "vue-template-render",
    pattern: /(template compilation error|failed to compile template)/,
    hint: "Vue template failed to compile — usually a syntax error or unknown directive",
    fix: "check the failing line for typos, unclosed tags, or directives that need a plugin",
    category: "Vue templates",
  },
];
