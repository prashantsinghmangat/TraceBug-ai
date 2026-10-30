// TraceBug demo video (16:9): every frame is rendered in Chromium (sub-pixel CSS
// transforms, deterministic per-frame timing), then encoded with ffmpeg.
// Audio is added afterwards by mix.mjs. See ../README.md.
//   node scripts/render.mjs            full render -> out/video-16x9.mp4
//   node scripts/render.mjs capture    re-render one scene into the existing frames
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const HERE = fileURLToPath(new URL("..", import.meta.url)).replace(/\\/g, "/").replace(/\/$/, "");
const REPO = fileURLToPath(new URL("../../..", import.meta.url)).replace(/\\/g, "/").replace(/\/$/, "");
const require = createRequire(`${REPO}/package.json`);
const { chromium } = require("playwright");

const ROOT = `${HERE}/out`;
const V = process.env.CLIPS || `${HERE}/clips`; // the raw screen recordings
const FR = `${ROOT}/frames-16x9`;
const FT = `${ROOT}/footage`;
const FPS = 30;
const ONLY = process.argv[2]; // optional: render only this scene id (preview)
fs.mkdirSync(`${ROOT}/parts`, { recursive: true });

const run = (args) => {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + args.slice(0, 12).join(" "));
};
const dur = (f) => +spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout.toString().trim();

// ── Scenes ──────────────────────────────────────────────────────────────
// zoom keys: [localTime, zoom, focusX, focusY] (focus = point of the footage kept centred)
// chips: [showAt, hideAt, text, kind, corner]
const S = [
  { id: "problem", vo: 1, kind: "problem" },
  { id: "brand", vo: 2, kind: "brand", pad: 0.9 },
  { id: "install", vo: 3, kind: "footage", kicker: "INSTALL", head: "Free for Chrome &amp; Firefox",
    src: { file: "01-install.mp4", ss: 0.5, to: 6.9, speed: 2, crop: [0, 0, 1920, 1015] },
    zoom: [[0, 1.3, 0.7, 0.22], [1.3, 1.35, 0.62, 0.2], [2.4, 1.0, 0.5, 0.4], [9, 1.06, 0.5, 0.45]],
    chips: [[2.6, 99, "No account · no server · MIT", "ok", "bl"]] },
  { id: "capture", vo: 4, kind: "footage", kicker: "STEP 1 · CAPTURE", head: "Click Capture. Reproduce the bug.",
    src: { file: "04-claude-fix.mp4", ss: 1.5, to: 20.0, speed: 2.85, crop: [0, 0, 1920, 1015] },
    zoom: [[0, 1.55, 0.8, 0.2], [1.15, 1.55, 0.8, 0.22], [2.0, 1.4, 0.36, 0.5], [3.8, 1.45, 0.4, 0.52], [4.6, 1.5, 0.42, 0.52], [9, 1.5, 0.42, 0.52]],
    chips: [[2.4, 99, "● REC  clicks · console · network", "rec", "tr"], [4.65, 99, "✕  TypeError captured", "err", "br"]] },
  { id: "report", vo: 5, kind: "footage", kicker: "STEP 1 · CAPTURE", head: "One report. Everything your AI needs.",
    src: { file: "04-claude-fix.mp4", ss: 22.2, to: 24.8, speed: 1, crop: [25, 145, 1260, 840] },
    zoom: [[0, 1.0, 0.5, 0.5], [1.4, 1.0, 0.5, 0.5], [3.0, 1.32, 0.8, 0.38], [9, 1.34, 0.8, 0.38]],
    chips: [[3.1, 99, "at applyCoupon (app.js:18)", "code", "br"]] },
  { id: "prompt", vo: 6, kind: "footage", kicker: "STEP 2 · HAND OFF", head: "Fix with AI: the full context, copied",
    src: { file: "04-claude-fix.mp4", ss: 25.3, to: 29.8, speed: 1, crop: [300, 195, 710, 790] },
    zoom: [[0, 1.0, 0.5, 0.2], [9, 1.12, 0.5, 0.25]],
    chips: [[1.6, 99, "Error · steps · stack · env", "ok", "br"]] },
  { id: "claude", vo: 7, kind: "footage", kicker: "STEP 2 · HAND OFF", head: "Claude Code reads the report",
    src: { file: "04-claude-fix.mp4", ss: 30.0, to: 54.5, speed: 4.4, crop: [858, 45, 1062, 935] },
    zoom: [[0, 1.0, 0.5, 0.25], [9, 1.1, 0.5, 0.4]], chips: [[0.5, 99, "⏩ 4×", "ff", "tr"]] },
  { id: "fix", vo: 8, kind: "footage", kicker: "STEP 2 · HAND OFF", head: "It finds the real cause, and fixes it",
    src: { file: "04-claude-fix.mp4", ss: 54.8, to: 59.0, speed: 1, crop: [860, 150, 1060, 600] },
    zoom: [[0, 1.0, 0.4, 0.3], [1.8, 1.3, 0.3, 0.35], [4.2, 1.3, 0.3, 0.37], [5.4, 1.08, 0.45, 0.55], [9, 1.08, 0.45, 0.55]],
    chips: [[1.9, 99, "Root cause: SAVE20 missing from coupons.js", "ok", "br"]] },
  { id: "proof", vo: 9, kind: "footage", kicker: "STEP 3 · FIXED", head: "SAVE20 works. $129.00 → $103.20",
    src: { file: "05-proof.mp4", ss: 7.0, to: 12.6, speed: 1.6, crop: [0, 108, 1310, 790] },
    zoom: [[0, 1.0, 0.5, 0.5], [1.0, 1.0, 0.5, 0.5], [1.8, 1.32, 0.55, 0.78], [9, 1.36, 0.55, 0.8]],
    chips: [[1.35, 99, "✓  $103.20", "win", "br"]], chime: 1.35 },
  { id: "tools", vo: 10, kind: "tools" },
  { id: "cta", vo: 11, kind: "cta", pad: 1.2 },
];

let t0 = 0;
for (const s of S) {
  s.voDur = dur(`${ROOT}/vo/l${s.vo}.mp3`);
  s.dur = +(s.voDur + (s.pad ?? 0.35)).toFixed(2);
  s.start = t0;
  t0 += s.dur;
}
const TOTAL = t0;
console.log("total", TOTAL.toFixed(2));

// ── Footage frames ──────────────────────────────────────────────────────
fs.mkdirSync(FT, { recursive: true });
for (const s of S.filter((x) => x.kind === "footage")) {
  const d = `${FT}/${s.id}`;
  const { file, ss, to, speed, crop } = s.src;
  const key = JSON.stringify(s.src);
  if (!fs.existsSync(`${d}/00001.jpg`) || !fs.existsSync(`${d}/src.json`) || fs.readFileSync(`${d}/src.json`, "utf8") !== key) {
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(`${d}/src.json`, key);
    run(["-ss", String(ss), "-to", String(to), "-i", `${V}/${file}`, "-vf",
      `setpts=(PTS-STARTPTS)/${speed},fps=${FPS},crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]}`, "-q:v", "2", `${d}/%05d.jpg`]);
  }
  s.frames = fs.readdirSync(d).filter((f) => f.endsWith(".jpg")).length;
  s.dir = "file:///" + d;
}

// ── Stage page ──────────────────────────────────────────────────────────
const LOGO = fs.readFileSync(`${REPO}/tracebug-extension/icons/icon128.svg`, "utf8")
  .replace(/width="128" height="128"/, 'width="100%" height="100%"');
fs.writeFileSync(`${ROOT}/stage.html`, `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--f:'Segoe UI Variable Display','Segoe UI',system-ui,sans-serif;--m:'Cascadia Code',Consolas,monospace}
*{box-sizing:border-box;margin:0}
body{width:1920px;height:1080px;overflow:hidden;background:#07070d;font-family:var(--f);color:#fff}
#bg{position:absolute;inset:-200px}
.glow{position:absolute;border-radius:50%;filter:blur(40px)}
#grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(1000px 700px at 50% 50%,#000,transparent)}
.layer{position:absolute;inset:0}
.kick{display:inline-block;padding:8px 18px;border-radius:999px;background:rgba(99,102,241,.16);border:1px solid rgba(129,140,248,.5);color:#C7D2FE;font:700 20px var(--f);letter-spacing:.16em}
.head{font:650 54px var(--f);letter-spacing:-.025em;text-shadow:0 6px 30px rgba(0,0,0,.5)}
.w{display:inline-block;white-space:pre}
.panel{position:absolute;border-radius:20px;overflow:hidden;background:#000;box-shadow:0 40px 100px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.12)}
.panel img{position:absolute;left:0;top:0;transform-origin:0 0}
.chip{position:absolute;padding:14px 22px;border-radius:14px;font:650 26px var(--f);white-space:nowrap;box-shadow:0 18px 50px rgba(0,0,0,.45);backdrop-filter:blur(8px)}
.chip.ok{background:rgba(15,15,30,.88);border:1px solid rgba(129,140,248,.6);color:#E0E7FF}
.chip.err{background:#2A0E14;border:1px solid #F87171;color:#FCA5A5}
.chip.rec{background:rgba(15,15,30,.88);border:1px solid rgba(248,113,113,.6);color:#FECACA}
.chip.code{background:#0B0B14;border:1px solid rgba(129,140,248,.6);color:#A5B4FC;font:600 24px var(--m)}
.chip.win{background:#052e1a;border:1px solid #34D399;color:#6EE7B7;font:750 40px var(--f)}
.chip.ff{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#fff;font:700 22px var(--f);padding:8px 14px}
.logo{position:absolute}
.card{position:absolute;left:50%;top:50%;width:980px;border-radius:24px;background:#10101c;border:1px solid rgba(255,255,255,.1);box-shadow:0 40px 100px rgba(0,0,0,.6);padding:34px 40px}
.bub{max-width:640px;padding:18px 24px;border-radius:18px;font:500 30px var(--f);line-height:1.35}
.item{display:flex;gap:14px;align-items:center;font:600 30px var(--f);color:#FCA5A5;margin-top:12px}
.tool{position:absolute;padding:16px 28px;border-radius:999px;background:rgba(17,17,32,.92);border:1px solid rgba(129,140,248,.45);font:650 30px var(--f);white-space:nowrap;box-shadow:0 18px 50px rgba(0,0,0,.45)}
</style></head><body>
<div id="bg"><div class="glow" id="g1" style="width:1100px;height:800px;background:radial-gradient(closest-side,rgba(99,102,241,.45),transparent)"></div>
<div class="glow" id="g2" style="width:1000px;height:900px;background:radial-gradient(closest-side,rgba(168,85,247,.32),transparent)"></div>
<div class="glow" id="g3" style="width:900px;height:700px;background:radial-gradient(closest-side,rgba(56,189,248,.14),transparent)"></div></div>
<div id="grid"></div>
<div class="layer" id="stage"></div>
<script>
const S=${JSON.stringify(S)}, TOTAL=${TOTAL}, LOGO=${JSON.stringify(LOGO)};
const cl=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const eOut=x=>1-Math.pow(1-cl(x),3), eIO=x=>{x=cl(x);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2};
const eBack=x=>{x=cl(x);const c=1.4;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const prog=(t,a,d)=>cl((t-a)/d);
const $=(h)=>{const d=document.createElement('div');d.innerHTML=h.trim();return d.firstChild};
let cur=null, els={};
const words=(txt,cls)=>'<div class="'+cls+'">'+txt.split(' ').map(w=>'<span class="w">'+w+' </span>').join('')+'</div>';
function layoutPanel(s){const c=s.src.crop, bw=1640, bh=790, sc=Math.min(bw/c[2],bh/c[3]);const w=Math.round(c[2]*sc),h=Math.round(c[3]*sc);return {w,h,x:(1920-w)/2,y:220+(bh-h)/2,base:sc}}
function build(s){
  const st=document.getElementById('stage'); st.innerHTML=''; els={};
  if(s.kind==='footage'){
    const p=layoutPanel(s); s.p=p;
    st.append(els.top=$('<div style="position:absolute;top:46px;left:0;right:0;text-align:center"><div class="kick">'+s.kicker+'</div>'+words(s.head,'head')+'</div>'));
    els.top.querySelector('.head').style.marginTop='18px';
    st.append(els.panel=$('<div class="panel" style="left:'+p.x+'px;top:'+p.y+'px;width:'+p.w+'px;height:'+p.h+'px"><img></div>'));
    els.img=els.panel.querySelector('img'); els.img.style.width=s.src.crop[2]*p.base+'px'; els.img.style.height=s.src.crop[3]*p.base+'px';
    els.chips=(s.chips||[]).map(c=>{const e=$('<div class="chip '+c[3]+'">'+c[2]+'</div>');st.append(e);return e});
  } else if(s.kind==='problem'){
    st.append(els.card=$('<div class="card"><div style="display:flex;align-items:center;gap:12px;color:#A1A1AA;font:600 24px var(--f);margin-bottom:26px"><span style="color:#C084FC">✦</span> AI coding assistant</div>'+
      '<div style="display:flex;justify-content:flex-end"><div class="bub" id="u" style="background:#4F46E5;color:#fff;border-bottom-right-radius:6px"></div></div>'+
      '<div style="display:flex;margin-top:22px"><div class="bub" id="a" style="background:#1c1c2e;color:#E4E4E7;border-bottom-left-radius:6px;min-height:70px"><div id="dots" style="font:700 34px var(--f);letter-spacing:6px;color:#A1A1AA">•••</div><div id="at">I can’t see the bug. Can you send me:</div>'+
      '<div class="item" id="i0">✕ <span>the exact error</span></div><div class="item" id="i1">✕ <span>the steps to reproduce</span></div><div class="item" id="i2">✕ <span>the console &amp; network logs</span></div></div></div></div>'));
  } else if(s.kind==='brand'){
    st.append(els.logo=$('<div class="logo" style="left:810px;top:300px;width:300px;height:300px;filter:drop-shadow(0 20px 60px rgba(99,102,241,.55))">'+LOGO+'</div>'));
    st.append(els.word=$('<div style="position:absolute;top:640px;left:0;right:0;text-align:center;font:800 120px var(--f);letter-spacing:-.045em">TraceBug</div>'));
    st.append(els.sub=$('<div style="position:absolute;top:800px;left:0;right:0;text-align:center;font:500 38px var(--f);color:#C7D2FE">Give your AI everything it needs to fix a bug.</div>'));
  } else if(s.kind==='tools'){
    st.append(els.top=$('<div style="position:absolute;top:60px;left:0;right:0;text-align:center"><div class="kick">INTEGRATIONS</div>'+words('Works with the tools you already use','head')+'</div>'));
    els.top.querySelector('.head').style.marginTop='18px';
    st.append(els.ring=$('<div style="position:absolute;left:760px;top:420px;width:400px;height:400px;border-radius:50%;border:1px dashed rgba(129,140,248,.35)"></div>'));
    st.append(els.logo=$('<div class="logo" style="left:860px;top:520px;width:200px;height:200px;filter:drop-shadow(0 20px 60px rgba(99,102,241,.55))">'+LOGO+'</div>'));
    els.tools=['Claude Code','Cursor','GitHub','Linear','Slack','Any MCP client'].map(n=>{const e=$('<div class="tool">'+n+'</div>');st.append(e);return e});
  } else if(s.kind==='cta'){
    els.ws=['Capture.','Hand off.','Fixed.'].map((w,i)=>{const e=$('<div style="position:absolute;top:330px;font:800 110px var(--f);letter-spacing:-.04em;'+(i==2?'background:linear-gradient(90deg,#818CF8,#C084FC);-webkit-background-clip:text;color:transparent':'')+'">'+w+'</div>');st.append(e);return e});
    st.append(els.lock=$('<div style="position:absolute;top:560px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:22px"><div style="width:96px;height:96px">'+LOGO+'</div><div style="font:800 76px var(--f);letter-spacing:-.04em">TraceBug</div></div>'));
    st.append(els.url=$('<div style="position:absolute;top:720px;left:0;right:0;text-align:center;font:600 46px var(--f)">Free &amp; open source at <span style="position:relative;display:inline-block;padding:4px 14px"><span id="hl" style="position:absolute;left:0;top:0;bottom:0;border-radius:10px;background:#4F46E5"></span><span style="position:relative">tracebug.dev</span></span></div>'));
    st.append(els.foot=$('<div style="position:absolute;top:830px;left:0;right:0;text-align:center;font:500 30px var(--f);color:#A1A1AA">Chrome &amp; Firefox · Claude Code · Cursor · MIT</div>'));
  }
}
function enterExit(s,lt){return {in:eOut(prog(lt,0,.6)), out:1-eIO(prog(lt,s.dur-.38,.38))}}
function kin(el,lt,at){el.querySelectorAll('.w').forEach((w,i)=>{const k=eOut(prog(lt,at+i*.055,.5));w.style.opacity=k;w.style.transform='translateY('+(28*(1-k))+'px)'})}
function zoomAt(s,lt){const z=s.zoom;let a=z[0],b=z[z.length-1];for(let i=0;i<z.length-1;i++){if(lt>=z[i][0]&&lt<=z[i+1][0]){a=z[i];b=z[i+1];break}}
  if(lt<=z[0][0])return z[0].slice(1); const k=eIO((lt-a[0])/Math.max(.001,b[0]-a[0]));return [1,2,3].map(j=>a[j]+(b[j]-a[j])*k)}
async function render(T){
  document.getElementById('g1').style.transform='translate('+(300+160*Math.sin(T*.21))+'px,'+(120+90*Math.cos(T*.17))+'px)';
  document.getElementById('g2').style.transform='translate('+(1050+140*Math.cos(T*.19))+'px,'+(520+110*Math.sin(T*.23))+'px)';
  document.getElementById('g3').style.transform='translate('+(700+260*Math.sin(T*.11))+'px,'+(260+120*Math.sin(T*.15))+'px)';
  const s=S.find(x=>T>=x.start&&T<x.start+x.dur)||S[S.length-1]; const lt=T-s.start;
  if(cur!==s.id){build(s);cur=s.id}
  const ee=enterExit(s,lt), vis=Math.min(ee.in,ee.out);
  const st=document.getElementById('stage'); st.style.opacity=s.kind==='cta'?ee.in:vis; st.style.filter='blur('+(6*(1-ee.out))+'px)';
  if(s.kind==='footage'){
    kin(els.top.querySelector('.head'),lt,.12); const kk=eBack(prog(lt,0,.5)); els.top.querySelector('.kick').style.transform='scale('+(.6+.4*kk)+')';
    const p=s.p, pin=eBack(prog(lt,.05,.75));
    els.panel.style.transform='translateY('+(70*(1-pin))+'px) scale('+(.92+.08*pin)+')'; els.panel.style.opacity=cl(prog(lt,.05,.35));
    const [z,fx,fy]=zoomAt(s,lt), iw=s.src.crop[2]*p.base*z, ih=s.src.crop[3]*p.base*z;
    const x=cl(p.w/2-fx*iw,p.w-iw,0), y=cl(p.h/2-fy*ih,p.h-ih,0);
    els.img.style.transform='translate('+x+'px,'+y+'px) scale('+z+')';
    const fi=Math.min(s.frames,Math.floor(lt*${FPS})+1); const src=s.dir+'/'+String(fi).padStart(5,'0')+'.jpg';
    if(els.img.dataset.f!==src){els.img.dataset.f=src;els.img.src=src;await els.img.decode().catch(()=>{})}
    (s.chips||[]).forEach((c,i)=>{const e=els.chips[i], k=eBack(prog(lt,c[0],.45)), r={width:e.offsetWidth,height:e.offsetHeight};
      const m=26, pos={tl:[p.x+m,p.y+m],tr:[p.x+p.w-m-r.width,p.y+m],bl:[p.x+m,p.y+p.h-m-r.height],br:[p.x+p.w-m-r.width,p.y+p.h-m-r.height]}[c[4]];
      e.style.left=pos[0]+'px';e.style.top=pos[1]+'px';e.style.opacity=cl(prog(lt,c[0],.2));e.style.transform='translateY('+(16*(1-k))+'px) scale('+(.7+.3*k)+')';
      if(c[3]==='rec'){const d=e.firstChild;e.style.borderColor='rgba(248,113,113,'+(.4+.4*Math.abs(Math.sin(lt*3)))+')'}});
  } else if(s.kind==='problem'){
    const k=eBack(prog(lt,0,.7)); els.card.style.transform='translate(-50%,-50%) translateY('+(60*(1-k))+'px) scale('+(.9+.1*k)+')';
    const msg='The checkout coupon is broken. Can you fix it?', n=Math.floor(cl((lt-.45)/1.5)*msg.length);
    const u=els.card.querySelector('#u'); u.textContent=msg.slice(0,n)+(n<msg.length&&lt>.4?'|':''); u.style.opacity=lt>.4?1:0;
    const a=els.card.querySelector('#a'), dots=els.card.querySelector('#dots'), at=els.card.querySelector('#at');
    a.style.opacity=cl(prog(lt,2.1,.25)); dots.style.display=lt<2.9?'block':'none'; dots.style.opacity=.4+.6*Math.abs(Math.sin(lt*6));
    at.style.display=lt>=2.9?'block':'none'; at.style.opacity=cl(prog(lt,2.9,.3));
    [3.45,3.95,4.5].forEach((t,i)=>{const e=els.card.querySelector('#i'+i), q=eBack(prog(lt,t,.4)); e.style.display=lt>=2.9?'flex':'none'; e.style.opacity=cl(prog(lt,t,.2)); e.style.transform='translateX('+(-30*(1-q))+'px)'});
  } else if(s.kind==='brand'){
    const k=eBack(prog(lt,.05,.7)); els.logo.style.transform='scale('+(.3+.7*k)+') rotate('+(-12*(1-k))+'deg)'; els.logo.style.opacity=cl(prog(lt,.05,.2));
    const w=eOut(prog(lt,.35,.6)); els.word.style.opacity=w; els.word.style.transform='translateY('+(40*(1-w))+'px)';
    const u=eOut(prog(lt,.75,.6)); els.sub.style.opacity=u; els.sub.style.transform='translateY('+(30*(1-u))+'px)';
  } else if(s.kind==='tools'){
    kin(els.top.querySelector('.head'),lt,.12);
    const k=eBack(prog(lt,.1,.6)); els.logo.style.transform='scale('+(.4+.6*k)+')'; els.ring.style.transform='scale('+(.4+.6*k)+') rotate('+lt*8+'deg)'; els.ring.style.opacity=k;
    const rot=lt*0.12; els.tools.forEach((e,i)=>{const at=.7+i*.42, q=eBack(prog(lt,at,.5)), ang=-Math.PI/2+i*Math.PI*2/6+rot, R=330*(.55+.45*q);
      const r={width:e.offsetWidth,height:e.offsetHeight}; e.style.left=(960+R*Math.cos(ang)*1.35-r.width/2)+'px'; e.style.top=(620+R*Math.sin(ang)*.9-r.height/2)+'px';
      e.style.opacity=cl(prog(lt,at,.2)); e.style.transform='scale('+(.5+.5*q)+')'});
  } else if(s.kind==='cta'){
    const at=[.05,.75,1.5], gap=50; let widths=els.ws.map(e=>e.offsetWidth), tw=widths.reduce((a,b)=>a+b)+gap*2, x=960-tw/2;
    const up=eIO(prog(lt,2.5,.7));
    els.ws.forEach((e,i)=>{const q=eBack(prog(lt,at[i],.5)); e.style.left=x+'px'; x+=widths[i]+gap; e.style.opacity=cl(prog(lt,at[i],.2));
      e.style.transform='translateY('+(50*(1-q)-150*up)+'px) scale('+(1-.35*up)+')'});
    const l=eBack(prog(lt,2.7,.6)); els.lock.style.opacity=cl(prog(lt,2.7,.25)); els.lock.style.transform='translateY('+(-110+40*(1-l))+'px) scale('+(.8+.2*l)+')';
    const u=eOut(prog(lt,3.2,.5)); els.url.style.opacity=u; els.url.style.transform='translateY('+(-90+30*(1-u))+'px)';
    document.getElementById('hl').style.width=(100*eIO(prog(lt,3.6,.6)))+'%';
    els.foot.style.opacity=eOut(prog(lt,4.1,.5)); els.foot.style.transform='translateY(-90px)';
    document.getElementById('stage').style.opacity=1-eIO(prog(lt,s.dur-.5,.5));
  }
}
window.render=render;
</script></body></html>`);

// ── Render frames ───────────────────────────────────────────────────────
if (!ONLY) fs.rmSync(FR, { recursive: true, force: true });
fs.mkdirSync(FR, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto("file:///" + ROOT + "/stage.html");
const list = ONLY ? S.filter((s) => s.id === ONLY) : S;
let n = 0;
for (const s of list) {
  const first = Math.round(s.start * FPS), last = Math.round((s.start + s.dur) * FPS);
  for (let f = first; f < last; f++) {
    await page.evaluate((t) => window.render(t), f / FPS);
    await page.screenshot({ path: `${FR}/${String(f).padStart(5, "0")}.jpg`, type: "jpeg", quality: 93 });
  }
  console.log("rendered", s.id, (s.start).toFixed(2), s.dur);
}
await browser.close();
// A one-scene preview on a fresh out/ has no frame 0 yet; only encode once the
// whole sequence exists (preview frames are named by their global index).
if (fs.existsSync(`${FR}/00000.jpg`))
  run(["-framerate", String(FPS), "-i", `${FR}/%05d.jpg`, "-c:v", "libx264", "-crf", "17", "-preset", "slow", "-pix_fmt", "yuv420p", `${ROOT}/parts/video-16x9.mp4`]);
else console.log("frames written to", FR, "(no full sequence yet, so not encoded)");
fs.writeFileSync(`${ROOT}/timeline.json`, JSON.stringify({ total: TOTAL, scenes: S.map(({ id, start, dur, vo, chime }) => ({ id, start, dur, vo, chime })) }, null, 2));
console.log("done", TOTAL.toFixed(2));
