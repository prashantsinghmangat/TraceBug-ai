import { describe, it, expect } from "vitest";
import {
  appendPoint, arrowGeometry, boxFrom, constrainEnd, isEditableNode, isTinyDrag, shortcutFor, smoothPathData, TOOL_ORDER,
} from "../src/annotate-geometry";

const key = (k: string, extra: Partial<{ code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing: boolean; repeat: boolean }> = {}) =>
  ({ key: k, code: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extra });

describe("annotate shortcuts", () => {
  it("maps 1-8 to the tools in toolbar order", () => {
    TOOL_ORDER.forEach((tool, i) => {
      expect(shortcutFor(key(String(i + 1), { code: `Digit${i + 1}` }), [])).toEqual({ kind: "tool", tool });
    });
    expect(shortcutFor(key("9", { code: "Digit9" }), [])).toBeNull();
  });

  it("uses the physical key on layouts where digits need Shift (AZERTY)", () => {
    expect(shortcutFor(key("&", { code: "Digit1" }), [])).toEqual({ kind: "tool", tool: "pen" });
  });

  it("never fires while typing in a page field", () => {
    const input = { tagName: "INPUT", type: "text" };
    const area = { tagName: "textarea" };
    const editable = { tagName: "DIV", isContentEditable: true };
    const roleBox = { tagName: "DIV", getAttribute: (n: string) => (n === "role" ? "textbox" : null) };
    for (const el of [input, area, editable, roleBox]) {
      expect(shortcutFor(key("1", { code: "Digit1" }), [el])).toBeNull();
      expect(shortcutFor(key("z", { ctrlKey: true }), [el])).toBeNull();
      expect(shortcutFor(key("Escape"), [el])).toBeNull();
    }
    // A checkbox is not a text field.
    expect(isEditableNode({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(shortcutFor(key("2", { code: "Digit2" }), [{ tagName: "INPUT", type: "checkbox" }])).toEqual({ kind: "tool", tool: "rect" });
  });

  it("ignores modified digits, IME composition and key repeat", () => {
    expect(shortcutFor(key("1", { code: "Digit1", ctrlKey: true }), [])).toBeNull();
    expect(shortcutFor(key("1", { code: "Digit1", altKey: true }), [])).toBeNull();
    expect(shortcutFor(key("1", { code: "Digit1", isComposing: true }), [])).toBeNull();
    expect(shortcutFor(key("1", { code: "Digit1", repeat: true }), [])).toBeNull();
  });

  it("undo / redo on Ctrl or Cmd", () => {
    expect(shortcutFor(key("z", { ctrlKey: true }), [])).toEqual({ kind: "undo" });
    expect(shortcutFor(key("Z", { metaKey: true, shiftKey: true }), [])).toEqual({ kind: "redo" });
    expect(shortcutFor(key("y", { ctrlKey: true }), [])).toEqual({ kind: "redo" });
    expect(shortcutFor(key("c", { ctrlKey: true }), [])).toBeNull();
  });
});

describe("annotate geometry", () => {
  it("drops sub-pixel jitter", () => {
    const pts = [{ x: 0, y: 0 }];
    expect(appendPoint(pts, { x: 0.5, y: 0.5 })).toBe(false);
    expect(appendPoint(pts, { x: 5, y: 0 })).toBe(true);
    expect(pts).toHaveLength(2);
  });

  it("builds a smoothed path through midpoints", () => {
    const d = smoothPathData([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    expect(d).toBe("M 0 0 Q 10 0 10 5 L 10 10");
    expect(smoothPathData([])).toBe("");
  });

  it("normalises boxes dragged in any direction", () => {
    expect(boxFrom({ x: 50, y: 40 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 10, w: 40, h: 30 });
  });

  it("Shift snaps lines to 45 degrees and boxes to squares", () => {
    const e = constrainEnd("line", { x: 0, y: 0 }, { x: 100, y: 8 });
    expect(Math.round(e.y)).toBe(0);
    const sq = constrainEnd("rect", { x: 0, y: 0 }, { x: -30, y: 10 });
    expect(sq).toEqual({ x: -30, y: 30 });
  });

  it("arrow head points at the end and the shaft stops inside it", () => {
    const g = arrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 3);
    expect(g.head.startsWith("M 100 0")).toBe(true);
    const shaftEnd = Number(g.shaft.split(" L ")[1].split(" ")[0]);
    expect(shaftEnd).toBeLessThan(100);
    expect(shaftEnd).toBeGreaterThan(80);
  });

  it("treats clicks as tiny and drags as real", () => {
    expect(isTinyDrag("rect", { x: 0, y: 0 }, { x: 2, y: 1 })).toBe(true);
    expect(isTinyDrag("rect", { x: 0, y: 0 }, { x: 20, y: 1 })).toBe(false);
    expect(isTinyDrag("pen", { x: 0, y: 0 }, { x: 0, y: 0 }, [{ x: 0, y: 0 }])).toBe(true);
    expect(isTinyDrag("pen", { x: 0, y: 0 }, { x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 30, y: 0 }])).toBe(false);
  });
});
