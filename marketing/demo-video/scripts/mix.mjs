// Audio: voice-over lines at each scene start, synth music bed ducked under the
// voice, whooshes on scene changes, chime on the $103.20 moment; then muxes it
// with a rendered video. Both formats share one timeline, so one mix fits both.
//   node scripts/mix.mjs          -> out/TraceBug-demo-16x9.mp4
//   node scripts/mix.mjs 9x16     -> out/TraceBug-demo-9x16.mp4
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const ROOT = fileURLToPath(new URL("../out", import.meta.url)).replace(/\\/g, "/");
const FORMAT = process.argv[2] === "9x16" ? "9x16" : "16x9";
const { total, scenes } = JSON.parse(fs.readFileSync(`${ROOT}/timeline.json`, "utf8"));
const D = Math.ceil(total * 10) / 10;
const brand = scenes.find((s) => s.id === "brand").start; // beat drops on "Meet TraceBug"
const outro = scenes.find((s) => s.id === "cta").start;
const proof = scenes.find((s) => s.id === "proof");
const VO_LEAD = 0.15;

const pick = (k, a) => `if(eq(${k},0),${a[0]},if(eq(${k},1),${a[1]},if(eq(${k},2),${a[2]},${a[3]})))`;
const K = "mod(floor(t/2.5),4)";
const N = [[261.63, 220.0, 174.61, 196.0], [329.63, 261.63, 220.0, 246.94], [392.0, 329.63, 261.63, 293.66], [493.88, 392.0, 329.63, 392.0]].map((a) => pick(K, a));
const BASS = pick(K, [65.41, 55.0, 43.65, 49.0]);
const env = "min(1,mod(t,2.5)/0.3)*min(1,(2.5-mod(t,2.5))/0.3)";
const sines = (mul) => N.map((f, i) => `${[1, 0.9, 0.75, 0.55][i]}*sin(2*PI*${f}*${mul}*t)`).join("+");
const pad = `0.06*${env}*(${sines(1)}+${sines(1.004)})`;
const J = "mod(floor(t/0.3125),8)";
const M = `if(lt(${J},4),${J},if(eq(${J},4),2,if(eq(${J},5),1,if(eq(${J},6),2,3))))`;
const arpF = `if(eq(${M},0),${N[0]},if(eq(${M},1),${N[1]},if(eq(${M},2),${N[2]},${N[3]})))`;
const q = "mod(t,0.3125)";
const arp = `gte(t,${brand})*0.08*exp(-7*${q})*min(1,${q}/0.004)*(sin(2*PI*2*(${arpF})*t)+0.3*sin(2*PI*4*(${arpF})*t))`;
const kq = "mod(t,0.625)";
const kick = `gte(t,${brand})*lt(t,${outro + 2})*0.38*exp(-9*${kq})*sin(2*PI*(45*${kq}+120*(1-exp(-35*${kq}))/35))`;
const bq = "mod(t,1.25)";
const bass = `gte(t,${brand})*0.15*exp(-2.5*${bq})*min(1,${bq}/0.01)*(sin(2*PI*${BASS}*t)+0.35*sin(2*PI*2*${BASS}*t))`;
const hq = "mod(t+0.3125,0.625)";
const hat = `gte(t,${brand + 2.5})*lt(t,${outro + 2})*0.045*exp(-45*${hq})*(2*random(0)-1)`;
const c0 = (proof.start + proof.chime).toFixed(2);
const chime = [[1046.5, 0], [1568.0, 0.12], [2093.0, 0.24]]
  .map(([f, d]) => `gte(t,${c0}+${d})*0.13*exp(-5*(t-${c0}-${d}))*sin(2*PI*${f}*(t-${c0}-${d}))`).join("+");
// whoosh: noise swelling into each scene change
const whoosh = scenes.slice(1).map((s) => {
  const w = (s.start - 0.25).toFixed(2);
  return `gte(t,${w})*lt(t,${w}+0.6)*0.10*sin(PI*(t-${w})/0.6)*sin(PI*(t-${w})/0.6)*(2*random(1)-1)`;
}).join("+");

const src = (expr) => ["-f", "lavfi", "-i", `aevalsrc='${expr}':s=48000:d=${D}`];
const vo = scenes.flatMap((s) => ["-i", `${ROOT}/vo/l${s.vo}.mp3`]);
const nIn = 7;
const voChains = scenes.map((s, i) => {
  const ms = Math.round((s.start + VO_LEAD) * 1000);
  return `[${nIn + i}:a]aresample=48000,pan=mono|c0=c0,adelay=${ms}:all=1[v${i}]`;
}).join(";");
const fc = [
  "[0:a]lowpass=f=2200,aecho=0.8:0.7:180|340:0.25|0.18[pad]",
  "[1:a]aecho=0.8:0.6:312|625:0.3|0.15,lowpass=f=5000[arp]",
  "[2:a]lowpass=f=180[kick]",
  "[3:a]lowpass=f=400[bass]",
  "[4:a]highpass=f=7000[hat]",
  "[5:a]aecho=0.8:0.7:120|260:0.3|0.2[chime]",
  "[6:a]bandpass=f=1800:w=2500,aecho=0.8:0.5:60:0.3[wh]",
  "[pad][arp][kick][bass][hat]amix=inputs=5:normalize=0,volume=0.55[mus]",
  voChains,
  `${scenes.map((_, i) => `[v${i}]`).join("")}amix=inputs=${scenes.length}:normalize=0,highpass=f=80,acompressor=threshold=0.2:ratio=2.5:attack=5:release=120,volume=1.6,asplit=2[vo][sc]`,
  "[mus][sc]sidechaincompress=threshold=0.04:ratio=6:attack=40:release=450[duck]",
  `[duck][vo][chime][wh]amix=inputs=4:normalize=0,afade=t=in:d=0.6,afade=t=out:st=${(D - 1.5).toFixed(2)}:d=1.5,pan=stereo|c0=c0|c1=c0,loudnorm=I=-15:TP=-1.5:LRA=9[a]`,
].join(";");

const run = (args) => {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
};
run([...src(pad), ...src(arp), ...src(kick), ...src(bass), ...src(hat), ...src(chime), ...src(whoosh), ...vo,
  "-filter_complex", fc, "-map", "[a]", "-ar", "48000", "-t", String(D), `${ROOT}/parts/mix.wav`]);
run(["-i", `${ROOT}/parts/video-${FORMAT}.mp4`, "-i", `${ROOT}/parts/mix.wav`, "-map", "0:v", "-map", "1:a",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", `${ROOT}/TraceBug-demo-${FORMAT}.mp4`]);
console.log("done", D, "chime", c0);
