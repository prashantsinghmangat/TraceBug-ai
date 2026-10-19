// rrweb's `maskAllInputs` covers <input>/<textarea>/<select>. A
// `contenteditable` is ordinary text nodes, so the DOM replay held every chat
// message, comment and document in full — including text the event capture
// had already redacted. The ticket showed "[REDACTED]" while the replay
// beside it carried the whole string.
//
// rrweb only calls `maskTextFn` for nodes that matched `maskTextSelector`, so
// the two halves are tested together: the selector picks candidates, the
// function decides. Both read the SAME sensitive-name list as the input rule.
import { describe, it, expect, beforeEach } from "vitest";
import { sensitiveEditorSelector, maskReplayText, maskChars } from "../src/replay-masking";
import { setRedactRules } from "../src/sanitize/custom-redaction";

/** What rrweb does: select candidates, then ask the mask function per node.
 *  `maskTextFn` receives the text node's PARENT element. */
function replayTextOf(node: Text): string {
  const selector = sensitiveEditorSelector();
  const parent = node.parentElement;
  const selected = !!(parent && selector && parent.closest(selector));
  if (!selected) return node.textContent || "";
  return maskReplayText(node.textContent || "", parent);
}

/** Every text node under an element, as the replay would record it. */
function replayTextUnder(el: HTMLElement): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) { out.push(replayTextOf(n as Text)); return; }
    n.childNodes.forEach(walk);
  };
  walk(el);
  return out;
}

function editor(attrs: Record<string, string>, html: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("contenteditable", "true");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  setRedactRules(undefined);
});

describe("a sensitive editor's text never reaches the replay", () => {
  it("masks text that was already there when the capture started", () => {
    // The full snapshot taken at record start is the leak that matters most:
    // the editor was filled in before anyone pressed Capture.
    const el = editor({ "aria-label": "Password hint" }, "<p>my mother's maiden name</p>");
    expect(replayTextUnder(el).join("")).not.toContain("maiden");
    expect(replayTextUnder(el).join("")).toMatch(/^\**[\s*]*$/);
  });

  it("masks text typed after the capture started", () => {
    const el = editor({ "aria-label": "Password hint" }, "<p><br></p>");
    el.innerHTML = "<p>hunter2hunter2</p>"; // the mutation rrweb would serialize
    expect(replayTextUnder(el).join("")).not.toContain("hunter2");
  });

  it("masks text in nested children, not just the host's direct text", () => {
    const el = editor(
      { "aria-label": "Secret note" },
      "<div><section><p>deep <b>nested</b> secret text</p></section></div>",
    );
    const text = replayTextUnder(el).join(" ");
    expect(text).not.toContain("nested");
    expect(text).not.toContain("secret text");
  });

  it("masks on any of the label attributes the input rule reads", () => {
    for (const attrs of [
      { name: "password" },
      { id: "api-token-box" },
      { "aria-label": "Credit card note" },
      { "data-placeholder": "Your SSN" },
      { "data-testid": "secret-editor" },
    ]) {
      document.body.innerHTML = "";
      const el = editor(attrs, "<p>sensitive value</p>");
      expect(replayTextUnder(el).join("")).not.toContain("sensitive value");
    }
  });

  it("masks the way rrweb does, so it looks like every other masked field", () => {
    expect(maskChars("ab c")).toBe("** *");
  });
});

describe("the boundaries hold", () => {
  it("leaves a normal editor's text visible — that is the bug report", () => {
    const el = editor({ "aria-label": "Message" }, "<p>Save button does nothing</p>");
    expect(replayTextUnder(el).join("")).toContain("Save button does nothing");
  });

  it("leaves ordinary page text alone", () => {
    const h = document.createElement("h1");
    h.textContent = "Password settings";
    document.body.appendChild(h);
    // The heading says "Password" but is not an editor: still visible.
    expect(replayTextUnder(h).join("")).toBe("Password settings");
  });

  it("unmasks a selector false positive — contenteditable=false", () => {
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "false");
    el.setAttribute("aria-label", "password help");
    el.innerHTML = "<p>Use 12 characters or more</p>";
    document.body.appendChild(el);
    // The attribute selector catches it; the per-element rule lets it through
    // because it is not an editing host.
    expect(replayTextUnder(el).join("")).toContain("Use 12 characters or more");
  });

  it("does not touch input masking — that is maskAllInputs' job", () => {
    // An <input> has no child text nodes, so nothing here applies to it.
    const input = document.createElement("input");
    input.name = "password";
    input.value = "hunter2";
    document.body.appendChild(input);
    expect(replayTextUnder(input)).toEqual([]);
    expect(sensitiveEditorSelector()).not.toContain("input");
  });
});

describe("the user's redaction rules reach the replay", () => {
  it("masks an editor named by a user-declared sensitive field", () => {
    setRedactRules({ fields: ["patient_id"] });
    const el = editor({ "aria-label": "patient_id notes" }, "<p>A-55-901</p>");
    expect(replayTextUnder(el).join("")).not.toContain("A-55-901");
  });

  it("applies Mask patterns to ordinary replay text", () => {
    setRedactRules({ patterns: ["\\d{3}-\\d{2}-\\d{4}"] });
    const p = document.createElement("p");
    p.textContent = "Account for 123-45-6789 is locked";
    document.body.appendChild(p);
    const out = replayTextUnder(p).join("");
    expect(out).not.toContain("123-45-6789");
    expect(out).toContain("Account for");
  });

  it("widens the selector only when rules exist", () => {
    expect(sensitiveEditorSelector()).not.toBe("*");
    setRedactRules({ patterns: ["\\d{3}-\\d{2}-\\d{4}"] });
    expect(sensitiveEditorSelector()).toBe("*");
    setRedactRules(undefined);
    expect(sensitiveEditorSelector()).not.toBe("*");
  });

  it("still fully masks a sensitive editor when rules widened the selector", () => {
    setRedactRules({ patterns: ["nothing-matching"] });
    const el = editor({ "aria-label": "password" }, "<p>hunter2</p>");
    expect(replayTextUnder(el).join("")).not.toContain("hunter2");
  });
});

describe("it fails closed", () => {
  it("masks when rrweb passes no element", () => {
    expect(maskReplayText("secret text", null)).not.toContain("secret");
  });

  it("masks rather than throwing out of a snapshot", () => {
    const hostile = { closest() { throw new Error("boom"); } } as unknown as HTMLElement;
    expect(maskReplayText("secret text", hostile)).not.toContain("secret");
  });
});
