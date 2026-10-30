// Generates the narrator: one MP3 per line of ../narration.txt, using
// Microsoft's AndrewNeural voice through the edge-tts CLI
// (`python -m pip install edge-tts`; only the narration text leaves the machine).
//   node scripts/voiceover.mjs
//   VOICE=en-US-AvaNeural RATE=+0% node scripts/voiceover.mjs
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const OUT = fileURLToPath(new URL("../out/vo/", import.meta.url));
const VOICE = process.env.VOICE || "en-US-AndrewNeural";
const RATE = process.env.RATE || "+6%";

fs.mkdirSync(OUT, { recursive: true });
const lines = fs.readFileSync(`${HERE}/narration.txt`, "utf8").trim().split(/\r?\n/);
lines.forEach((line, i) => {
  const file = `${OUT}l${i + 1}.mp3`;
  const r = spawnSync("python", ["-m", "edge_tts", "--voice", VOICE, `--rate=${RATE}`, "--text", line, "--write-media", file], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`edge-tts failed on line ${i + 1}`);
  console.log(`l${i + 1}.mp3  ${line}`);
});
