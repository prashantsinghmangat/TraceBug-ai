import { describe, it, expect } from "vitest";
import {
  connectionState, summarizeIntegrations, statusTooltip, pageIntegrationHint,
  type StatusInput,
} from "../src/providers/integration-status";

const gh = (o: Partial<StatusInput> = {}): StatusInput => ({ id: "github", label: "GitHub", connected: true, via: "oauth", account: "octo", container: "acme/web", ...o });
const ln = (o: Partial<StatusInput> = {}): StatusInput => ({ id: "linear", label: "Linear", connected: true, via: "oauth", account: "ana@acme.test", ...o });
const sl = (o: Partial<StatusInput> = {}): StatusInput => ({ id: "slack", label: "Slack", connected: true, via: "webhook", ...o });

describe("connectionState", () => {
  it("connected, reconnect, error, or not a connection", () => {
    expect(connectionState(gh())).toBe("connected");
    expect(connectionState(gh({ connected: false, needsReconnect: true }))).toBe("reconnect");
    expect(connectionState(gh({ hostsGranted: false }))).toBe("error");
    expect(connectionState(gh({ connected: false }))).toBeNull();
  });
  it("a working token beats an expired sign-in", () => {
    expect(connectionState(gh({ via: "token", needsReconnect: true }))).toBe("connected");
  });
});

describe("summarizeIntegrations", () => {
  it("nothing connected: no default, no attention, a call to connect", () => {
    const s = summarizeIntegrations([gh({ connected: false }), ln({ connected: false })], null);
    expect(s.connections).toEqual([]);
    expect(s.defaultId).toBeNull();
    expect(s.attention).toBe(false);
    expect(s.tooltip).toBe("No tracker connected · connect one");
  });

  it("the stored default wins while it is still a connection", () => {
    const s = summarizeIntegrations([gh(), ln(), sl()], "linear");
    expect(s.defaultId).toBe("linear");
    expect(s.connections.filter((c) => c.isDefault).map((c) => c.id)).toEqual(["linear"]);
  });

  it("a disconnected default falls back to the first connection, in fixed order", () => {
    expect(summarizeIntegrations([sl(), ln(), gh({ connected: false })], "github").defaultId).toBe("linear");
    expect(summarizeIntegrations([sl(), ln(), gh()], "nonsense").defaultId).toBe("github");
  });

  it("a connection that needs reconnecting can stay the default, and raises attention", () => {
    const s = summarizeIntegrations([gh({ connected: false, needsReconnect: true }), ln()], "github");
    expect(s.defaultId).toBe("github");
    expect(s.attention).toBe(true);
    expect(s.tooltip).toBe("GitHub · acme/web · needs reconnect");
    expect(s.connections[0].detail).toMatch(/sign-in expired/);
  });

  it("an error elsewhere raises attention even when the default is fine", () => {
    const s = summarizeIntegrations([gh(), ln({ hostsGranted: false })], "github");
    expect(s.attention).toBe(true);
    expect(s.tooltip).toBe("GitHub · acme/web · connected");
  });

  it("tooltip uses the container label and hides opaque ids", () => {
    const uuid = "0b7f8e2a-1234-4cde-9abc-0123456789ab";
    expect(summarizeIntegrations([ln({ container: uuid })]).tooltip).toBe("Linear · connected");
    expect(summarizeIntegrations([ln({ container: uuid, containerLabel: "ENG · Engineering" })]).tooltip).toBe("Linear · ENG · Engineering · connected");
  });

  it("ignores unknown and duplicate rows", () => {
    const s = summarizeIntegrations([{ id: "jira", label: "Jira", connected: true } as StatusInput, gh(), gh({ account: "dup" })]);
    expect(s.connections.map((c) => c.id)).toEqual(["github"]);
    expect(s.connections[0].account).toBe("octo");
  });
});

describe("what the page may know", () => {
  it("only an id and a flag — never a repo, team or account name", () => {
    const hint = pageIntegrationHint(summarizeIntegrations([gh(), ln({ connected: false, needsReconnect: true })], "github"));
    expect(hint).toEqual({ defaultTracker: "github", attention: true });
    expect(JSON.stringify(hint)).not.toMatch(/acme|octo|ana/);
  });
  it("statusTooltip(null)", () => {
    expect(statusTooltip(null)).toMatch(/No tracker connected/);
  });
});
