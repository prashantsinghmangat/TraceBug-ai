import { describe, it, expect } from "vitest";
import { clampTrim, isWholeClip, trimComments, formatClock, MIN_KEEP_S } from "../src/ui/video-trim";

describe("video trim selection", () => {
  it("clamps to the clip", () => {
    expect(clampTrim(-3, 99, 10, "end")).toEqual({ start: 0, end: 10 });
  });

  it("never keeps less than the minimum; the moving handle gives way", () => {
    expect(clampTrim(5, 5.1, 10, "start")).toEqual({ start: 5.1 - MIN_KEEP_S, end: 5.1 });
    expect(clampTrim(5, 5.1, 10, "end")).toEqual({ start: 5, end: 5 + MIN_KEEP_S });
  });

  it("knows when nothing is cut", () => {
    expect(isWholeClip(0, 10, 10)).toBe(true);
    expect(isWholeClip(0.5, 10, 10)).toBe(false);
    expect(isWholeClip(0, 9, 10)).toBe(false);
  });

  it("re-times comments and drops the ones cut away", () => {
    const out = trimComments([
      { offsetMs: 500, text: "before" },
      { offsetMs: 2500, text: "kept" },
      { offsetMs: 9000, text: "after" },
    ], 2, 5);
    expect(out).toEqual([{ offsetMs: 500, text: "kept" }]);
  });

  it("formats clock time with tenths", () => {
    expect(formatClock(0)).toBe("0:00.0");
    expect(formatClock(65.25)).toBe("1:05.3");
  });
});
