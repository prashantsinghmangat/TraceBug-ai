// Typing into a rich editor was never captured.
//
// `collectInputs` guarded on `"value" in target`, which is false for every
// ProseMirror / Lexical / Slate / Quill / TipTap surface — they are
// `contenteditable` divs. Clicks on them were recorded; the text was not. On
// a modern app that is most of what a user does: chat composers, comment
// boxes, document editors.
//
// These surfaces hold messages, documents and prompts, so the text goes
// through the SAME redaction and the SAME length cap as a plain field — that
// shared rule is what these tests pin down, in both directions.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { collectInputs, INPUT_VALUE_MAX, isSensitiveField } from "../src/collectors";

type Emitted = { type: string; data: Record<string, unknown> };

let emitted: Emitted[];
let detach: () => void;

/** ProseMirror's real shape: a contenteditable div of block children, with no
 *  name and no id — only an aria-label to identify it by. */
function proseMirror(label = "Message", html = "<p>Hello there</p>"): HTMLElement {
  const el = document.createElement("div");
  el.className = "ProseMirror";
  el.setAttribute("contenteditable", "true");
  el.setAttribute("aria-label", label);
  el.setAttribute("data-placeholder", "Write a message…");
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

/** Type into an editable: mutate its DOM, fire `input`, let the debounce run. */
function type(el: HTMLElement, html?: string, from: HTMLElement = el) {
  if (html !== undefined) el.innerHTML = html;
  from.dispatchEvent(new Event("input", { bubbles: true }));
  vi.advanceTimersByTime(350);
}

const lastInput = () => emitted.filter((e) => e.type === "input").slice(-1)[0];
const element = () => lastInput()?.data.element as Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
  emitted = [];
  detach = collectInputs((type, data) => { emitted.push({ type, data: data as Record<string, unknown> }); });
});

afterEach(() => { detach(); vi.useRealTimers(); });

describe("a ProseMirror-style editor is captured", () => {
  it("records what was typed", () => {
    const el = proseMirror();
    type(el, "<p>The save button does nothing</p>");
    expect(element().value).toBe("The save button does nothing");
  });

  it("marks it as a contenteditable, not a text input", () => {
    type(proseMirror());
    expect(element().type).toBe("contenteditable");
    expect(element().contentEditable).toBe(true);
    expect(element().tag).toBe("div");
  });

  it("names the field from aria-label when there is no name or id", () => {
    type(proseMirror("Message"));
    expect(element().name).toBe("Message");
  });

  it("falls back to data-placeholder, then data-testid", () => {
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "true");
    el.setAttribute("data-placeholder", "Add a comment");
    document.body.appendChild(el);
    type(el, "typed");
    expect(element().name).toBe("Add a comment");
  });

  it("keeps the block structure as line breaks", () => {
    // jsdom has no innerText, so this exercises the textContent fallback —
    // the point is that a multi-block document is not recorded as blank.
    const el = proseMirror("Doc", "<p>First</p><p>Second</p>");
    type(el);
    expect(element().value).toContain("First");
    expect(element().value).toContain("Second");
  });

  it("reports an editable nested inside the editing host", () => {
    const host = proseMirror("Message", "<p id='para'>Inner text</p>");
    const para = host.querySelector("#para") as HTMLElement;
    type(host, undefined, para);
    expect(element().name).toBe("Message"); // resolved up to the host
    expect(element().value).toBe("Inner text");
  });

  it("debounces a burst of keystrokes into one event", () => {
    const el = proseMirror();
    el.innerHTML = "<p>a</p>";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.innerHTML = "<p>ab</p>";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.innerHTML = "<p>abc</p>";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(350);
    expect(emitted.filter((e) => e.type === "input")).toHaveLength(1);
    expect(element().value).toBe("abc");
  });
});

describe("it holds to the same privacy rules as a plain field", () => {
  it("redacts an editor whose label says it is sensitive", () => {
    type(proseMirror("Password hint"), "<p>my mother's maiden name</p>");
    expect(element().value).toBe("[REDACTED]");
  });

  it("redacts on the same words a plain input does", () => {
    for (const label of ["password", "Secret note", "api token", "SSN", "credit card"]) {
      expect(isSensitiveField(label)).toBe(true);
    }
    expect(isSensitiveField("Message")).toBe(false);
  });

  it("caps a long document at the same limit as an input", () => {
    const long = "x".repeat(INPUT_VALUE_MAX * 3);
    type(proseMirror("Doc"), `<p>${long}</p>`);
    expect((element().value as string).length).toBe(INPUT_VALUE_MAX);
  });

  it("still reports the true length, so a cap never hides how much was typed", () => {
    const long = "y".repeat(1234);
    type(proseMirror("Doc"), `<p>${long}</p>`);
    expect(element().valueLength).toBe(1234);
  });

  it("reports length but no text when the field is sensitive", () => {
    type(proseMirror("password"), "<p>hunter2hunter2</p>");
    expect(element().value).toBe("[REDACTED]");
    expect(element().valueLength).toBe(14);
  });

  it("ignores TraceBug's own UI", () => {
    const root = document.createElement("div");
    root.id = "tracebug-root";
    document.body.appendChild(root);
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "true");
    root.appendChild(el);
    type(el, "internal note");
    expect(emitted).toHaveLength(0);
  });
});

describe("plain fields are untouched by the change", () => {
  const input = (attrs: Record<string, string>, value: string) => {
    const el = document.createElement("input");
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.value = value;
    document.body.appendChild(el);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(350);
    return el;
  };

  it("still captures a text input", () => {
    input({ name: "email", type: "text" }, "a@b.com");
    expect(element().value).toBe("a@b.com");
    expect(element().type).toBe("text");
    expect(element().contentEditable).toBeUndefined();
  });

  it("still redacts a password input", () => {
    input({ name: "pw", type: "password" }, "hunter2");
    expect(element().value).toBe("[REDACTED]");
  });

  it("still records checkbox state", () => {
    const el = document.createElement("input");
    el.type = "checkbox";
    el.name = "terms";
    el.checked = true;
    document.body.appendChild(el);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(350);
    expect(element().value).toBe("checked");
    expect(element().checked).toBe(true);
  });

  it("still ignores a select", () => {
    const el = document.createElement("select");
    document.body.appendChild(el);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(350);
    expect(emitted).toHaveLength(0);
  });

  it("ignores a plain div that is not editable", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(350);
    expect(emitted).toHaveLength(0);
  });
});

describe("what a captured editor is worth downstream", () => {
  it("becomes a repro step naming the editor and the text", async () => {
    const { generateReproSteps } = await import("../src/repro-generator");
    const ev = (data: Record<string, unknown>) => ({
      id: "x", sessionId: "s", projectId: "p", type: "input" as const,
      page: "/orders", timestamp: Date.now(), data,
    });
    const { reproSteps } = generateReproSteps(
      [ev({ element: { tag: "div", name: "Message", type: "contenteditable", value: "Save does nothing", valueLength: 17, contentEditable: true } })],
      "Issue reported by tester",
    );
    expect(reproSteps).toContain("Save does nothing");
    expect(reproSteps).toContain("Message");
  });

  it("does not leak a redacted editor's text into the steps", async () => {
    const { generateReproSteps } = await import("../src/repro-generator");
    const { reproSteps } = generateReproSteps(
      [{
        id: "x", sessionId: "s", projectId: "p", type: "input" as const, page: "/x", timestamp: Date.now(),
        data: { element: { tag: "div", name: "password", type: "contenteditable", value: "[REDACTED]", valueLength: 9, contentEditable: true } },
      }],
      "Issue reported by tester",
    );
    expect(reproSteps).not.toContain("[REDACTED]");
    expect(reproSteps.toLowerCase()).toContain("password");
  });
});
