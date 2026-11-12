// Call one tool on the BUILT TraceBug MCP server (dist/bin.mjs) over stdio,
// the way an MCP client would, and print the tool's text result.
//
//   node e2e/mcp-call.mjs <tool> '<json args>' [--dir <reports dir>]
//   node e2e/mcp-call.mjs get_audit '{"file":"tracebug-audit-before.html"}' --dir D:/tmp/loop
//
// For trying unreleased tools without registering a dev server in an MCP client.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../dist/bin.mjs", import.meta.url));

export function mcpCall(name, args, dir = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, "mcp", "--dir", dir], { stdio: ["pipe", "pipe", "ignore"] });
    let buf = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("MCP server did not answer in 20 s")); }, 20000);
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      for (const line of buf.split("\n")) {
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== 2) continue;
        clearTimeout(timer);
        child.kill();
        const content = msg.result?.content || [];
        const text = content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
        if (msg.result?.isError) reject(new Error(text)); else resolve(text);
        return;
      }
    });
    child.on("error", reject);
    const send = (m) => child.stdin.write(JSON.stringify(m) + "\n");
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-call", version: "0" } } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [name, json = "{}", ...rest] = process.argv.slice(2);
  const dirAt = rest.indexOf("--dir");
  if (!name) { console.error("usage: node e2e/mcp-call.mjs <tool> '<json args>' [--dir <dir>]"); process.exit(2); }
  try {
    console.log(await mcpCall(name, JSON.parse(json), dirAt >= 0 ? rest[dirAt + 1] : process.cwd()));
  } catch (err) {
    console.error(String(err.message || err));
    process.exit(1);
  }
}
