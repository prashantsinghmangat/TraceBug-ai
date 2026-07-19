// The `enabled` option — especially the boolean aliases and the unknown-value
// warning. Regression guard for a real incident: `enabled: true` (not in the
// old union) fell through to "auto" and silently disabled the SDK on the
// production sandbox. shouldEnable is private; we reach it via a typed view
// of the singleton rather than running full init (which mounts DOM UI).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TraceBug from "../src/index";

type EnabledMode = "auto" | "development" | "staging" | "all" | "off" | string[] | boolean;
const shouldEnable = (mode: EnabledMode | undefined): boolean =>
  (TraceBug as unknown as { shouldEnable(m: EnabledMode | undefined): boolean }).shouldEnable(mode);

const setHost = (hostname: string) => {
  Object.defineProperty(window, "location", {
    value: new URL(`https://${hostname}/`),
    writable: true,
    configurable: true,
  });
};

describe("enabled option", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("true is an alias for 'all' — enabled even on a production hostname", () => {
    setHost("tracebug.dev");
    expect(shouldEnable(true)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("false is an alias for 'off'", () => {
    setHost("localhost");
    expect(shouldEnable(false)).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("'all' and 'off' still behave", () => {
    setHost("tracebug.dev");
    expect(shouldEnable("all")).toBe(true);
    expect(shouldEnable("off")).toBe(false);
  });

  it("hostname list matches exact host and subdomains", () => {
    setHost("staging.myapp.com");
    expect(shouldEnable(["myapp.com"])).toBe(true);
    expect(shouldEnable(["other.com"])).toBe(false);
  });

  it("auto: enabled on localhost, disabled on a production hostname", () => {
    setHost("localhost");
    expect(shouldEnable("auto")).toBe(true);

    // Under vitest, import.meta.env.DEV is true, so detectEnvironment() always
    // reports "development" — stub it to exercise the production branch.
    setHost("tracebug.dev");
    const envSpy = vi
      .spyOn(TraceBug as unknown as { detectEnvironment(): string }, "detectEnvironment")
      .mockReturnValue("production");
    expect(shouldEnable("auto")).toBe(false);
    expect(shouldEnable(true)).toBe(true); // boolean alias still wins in production
    envSpy.mockRestore();
  });

  it("warns once for an unrecognized value and falls back to auto", () => {
    setHost("localhost");
    // deliberately wrong value, as a user typo would produce
    expect(shouldEnable("on" as unknown as EnabledMode)).toBe(true); // auto on localhost
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('Unknown `enabled` value "on"');
  });

  it("does not warn for undefined (caller applies the 'auto' default)", () => {
    setHost("localhost");
    shouldEnable(undefined);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
