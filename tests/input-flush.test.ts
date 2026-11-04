import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { collectInputs, collectClicks } from "../src/collectors";

// 1.12 item 2: an input is recorded 300 ms after the last keystroke, so a click
// within 300 ms was captured BEFORE the value it acted on, and a value typed
// just before Stop or leaving the page was thrown away.

type Emitted = { type: string; data: any };
let emitted: Emitted[];
let stopInputs: () => void;
let stopClicks: () => void;

function typeInto(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `<input id="coupon" name="coupon"><button id="apply">Apply</button>`;
  emitted = [];
  const emit = (type: any, data: any) => emitted.push({ type, data });
  stopInputs = collectInputs(emit);
  stopClicks = collectClicks(emit);
});

afterEach(() => { stopClicks(); vi.useRealTimers(); });

describe("pending typing is flushed, not lost or reordered", () => {
  it("a click right after typing is recorded AFTER the typed value", () => {
    typeInto(document.getElementById("coupon") as HTMLInputElement, "SAVE20");
    const btn = document.getElementById("apply")!;
    btn.dispatchEvent(new Event("pointerdown", { bubbles: true })); // precedes the click
    btn.click();
    stopInputs();
    expect(emitted.map((e) => e.type)).toEqual(["input", "click"]);
    expect(emitted[0].data.element.value).toBe("SAVE20");
  });

  it("Enter flushes too (a submit by keyboard)", () => {
    const field = document.getElementById("coupon") as HTMLInputElement;
    typeInto(field, "SAVE20");
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(emitted.filter((e) => e.type === "input")).toHaveLength(1);
    stopInputs();
  });

  it("stopping the capture keeps a value typed just before Stop", () => {
    typeInto(document.getElementById("coupon") as HTMLInputElement, "SAVE20");
    stopInputs();
    expect(emitted.filter((e) => e.type === "input").map((e) => e.data.element.value)).toEqual(["SAVE20"]);
  });

  it("leaving the page keeps it too", () => {
    typeInto(document.getElementById("coupon") as HTMLInputElement, "SAVE20");
    window.dispatchEvent(new Event("pagehide"));
    expect(emitted.filter((e) => e.type === "input")).toHaveLength(1);
    stopInputs();
  });

  it("a flushed value is emitted once, not again when its timer would have fired", () => {
    typeInto(document.getElementById("coupon") as HTMLInputElement, "SAVE20");
    document.getElementById("apply")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    vi.advanceTimersByTime(1000);
    stopInputs();
    expect(emitted.filter((e) => e.type === "input")).toHaveLength(1);
  });

  it("without a click, typing is still debounced to one event", () => {
    const field = document.getElementById("coupon") as HTMLInputElement;
    typeInto(field, "SA");
    typeInto(field, "SAVE20");
    vi.advanceTimersByTime(350);
    stopInputs();
    expect(emitted.filter((e) => e.type === "input").map((e) => e.data.element.value)).toEqual(["SAVE20"]);
  });
});
