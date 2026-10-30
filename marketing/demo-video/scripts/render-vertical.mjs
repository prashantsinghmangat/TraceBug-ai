// Vertical 9:16 cut (1080x1920): takes render.mjs, applies the portrait layout
// below (same scenes, narration and timing, plus burned-in subtitles), writes
// out/render-vertical.gen.mjs and runs it. Arguments pass through:
//   node scripts/render-vertical.mjs            full render -> out/parts/video-9x16.mp4
//   node scripts/render-vertical.mjs capture    re-render one scene
import fs from "node:fs";

let src = fs.readFileSync(new URL("render.mjs", import.meta.url), "utf8");
const rep = (a, b) => {
  if (!src.includes(a)) throw new Error("not found: " + a.slice(0, 80));
  src = src.split(a).join(b);
};

// Output paths, viewport, body size
rep("const FR = `${ROOT}/frames-16x9`;", "const FR = `${ROOT}/frames-9x16`;");
rep("`${ROOT}/stage.html`", "`${ROOT}/stage-9x16.html`");
rep('"file:///" + ROOT + "/stage.html"', '"file:///" + ROOT + "/stage-9x16.html"');
rep("`${ROOT}/parts/video-16x9.mp4`", "`${ROOT}/parts/video-9x16.mp4`");
rep("`${ROOT}/timeline.json`", "`${ROOT}/timeline-9x16.json`");
rep("viewport: { width: 1920, height: 1080 }", "viewport: { width: 1080, height: 1920 }");
rep("body{width:1920px;height:1080px;", "body{width:1080px;height:1920px;");

// Portrait zoom focus per scene (panel is 1000x1180 and the footage covers it)
rep("const TOTAL = t0;", `const TOTAL = t0;
const VZ = {
  install: [[0, 1.2, 0.68, 0.22], [1.3, 1.25, 0.62, 0.2], [2.4, 1.0, 0.5, 0.4], [9, 1.04, 0.5, 0.45]],
  capture: [[0, 1.3, 0.82, 0.2], [1.15, 1.3, 0.8, 0.22], [2.0, 1.0, 0.34, 0.5], [3.8, 1.0, 0.35, 0.5], [4.6, 1.06, 0.36, 0.56], [9, 1.06, 0.36, 0.56]],
  report: [[0, 1.0, 0.25, 0.5], [1.4, 1.0, 0.25, 0.5], [2.6, 1.1, 0.86, 0.38], [9, 1.12, 0.86, 0.38]],
  prompt: [[0, 1.0, 0.5, 0.2], [9, 1.08, 0.5, 0.25]],
  claude: [[0, 1.0, 0.35, 0.25], [9, 1.06, 0.35, 0.4]],
  fix: [[0, 1.0, 0.2, 0.3], [1.8, 1.2, 0.22, 0.35], [4.2, 1.2, 0.22, 0.37], [5.4, 1.0, 0.25, 0.6], [9, 1.0, 0.25, 0.6]],
  proof: [[0, 1.0, 0.5, 0.5], [1.0, 1.0, 0.5, 0.5], [1.8, 1.22, 0.62, 0.78], [9, 1.25, 0.62, 0.8]],
};
for (const s of S) if (VZ[s.id]) s.zoom = VZ[s.id];
const LINES = fs.readFileSync(\`\${HERE}/narration.txt\`, "utf8").trim().split(/\\r?\\n/);`);

// Panel: fixed portrait box, footage covers it
rep("function layoutPanel(s){const c=s.src.crop, bw=1640, bh=790, sc=Math.min(bw/c[2],bh/c[3]);const w=Math.round(c[2]*sc),h=Math.round(c[3]*sc);return {w,h,x:(1920-w)/2,y:220+(bh-h)/2,base:sc}}",
  "function layoutPanel(s){const c=s.src.crop, w=1000, h=1120, sc=Math.max(w/c[2],h/c[3]);return {w,h,x:40,y:560,base:sc}}");
rep(".head{font:650 54px var(--f);", ".head{padding:0 50px;line-height:1.12;text-wrap:balance;font:700 68px var(--f);");
rep(".kick{display:inline-block;padding:8px 18px;", ".kick{display:inline-block;padding:10px 22px;font-size:24px !important;");
rep(".chip{position:absolute;padding:14px 22px;border-radius:14px;font:650 26px", ".chip{position:absolute;padding:14px 22px;border-radius:14px;font:650 30px");
rep(`'<div style="position:absolute;top:46px;left:0;right:0;text-align:center"><div class="kick">'+s.kicker`,
  `'<div style="position:absolute;top:250px;left:0;right:0;text-align:center"><div class="kick">'+s.kicker`);

// Problem card narrower
rep(".card{position:absolute;left:50%;top:50%;width:980px;", ".card{position:absolute;left:50%;top:46%;width:980px;");
rep(".bub{max-width:640px;padding:18px 24px;border-radius:18px;font:500 30px", ".bub{max-width:720px;padding:20px 26px;border-radius:18px;font:500 34px");

// Brand reveal
rep("left:810px;top:300px;width:300px;height:300px;", "left:390px;top:560px;width:300px;height:300px;");
rep("position:absolute;top:640px;left:0;right:0;text-align:center;font:800 120px", "position:absolute;top:900px;left:0;right:0;text-align:center;font:800 130px");
rep("position:absolute;top:800px;left:0;right:0;text-align:center;font:500 38px var(--f);color:#C7D2FE\">Give your AI everything it needs to fix a bug.",
  "position:absolute;top:1080px;left:80px;right:80px;text-align:center;line-height:1.3;font:500 44px var(--f);color:#C7D2FE\">Give your AI everything it needs to fix a bug.");

// Tools orbit
rep(`'<div style="position:absolute;top:60px;left:0;right:0;text-align:center"><div class="kick">INTEGRATIONS</div>`,
  `'<div style="position:absolute;top:250px;left:0;right:0;text-align:center"><div class="kick">INTEGRATIONS</div>`);
rep("left:760px;top:420px;width:400px;height:400px;border-radius:50%", "left:340px;top:820px;width:400px;height:400px;border-radius:50%");
rep("left:860px;top:520px;width:200px;height:200px;", "left:440px;top:920px;width:200px;height:200px;");
rep("e.style.left=(960+R*Math.cos(ang)*1.35-r.width/2)+'px'; e.style.top=(620+R*Math.sin(ang)*.9-r.height/2)+'px';",
  "e.style.left=(540+R*Math.cos(ang)*.95-r.width/2)+'px'; e.style.top=(1020+R*Math.sin(ang)*1.4-r.height/2)+'px';");

// CTA: stack the three words vertically, then the lockup below
rep("position:absolute;top:330px;font:800 110px", "position:absolute;top:360px;font:800 130px");
rep("const at=[.05,.75,1.5], gap=50; let widths=els.ws.map(e=>e.offsetWidth), tw=widths.reduce((a,b)=>a+b)+gap*2, x=960-tw/2;",
  "const at=[.05,.75,1.5]; let widths=els.ws.map(e=>e.offsetWidth);");
rep("els.ws.forEach((e,i)=>{const q=eBack(prog(lt,at[i],.5)); e.style.left=x+'px'; x+=widths[i]+gap; e.style.opacity=cl(prog(lt,at[i],.2));\n      e.style.transform='translateY('+(50*(1-q)-150*up)+'px) scale('+(1-.35*up)+')'});",
  "els.ws.forEach((e,i)=>{const q=eBack(prog(lt,at[i],.5)); e.style.left=(540-widths[i]/2)+'px'; e.style.opacity=cl(prog(lt,at[i],.2));\n      e.style.transform='translateY('+(i*160+50*(1-q)-(120+i*55)*up)+'px) scale('+(1-.4*up)+')'});");
rep("position:absolute;top:560px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:22px",
  "position:absolute;top:1060px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:22px");
rep("position:absolute;top:720px;left:0;right:0;text-align:center;font:600 46px", "position:absolute;top:1230px;left:0;right:0;text-align:center;font:600 50px");
rep("position:absolute;top:830px;left:0;right:0;text-align:center;font:500 30px", "position:absolute;top:1340px;left:60px;right:60px;text-align:center;line-height:1.4;font:500 32px");

// Background glows for portrait
rep("'translate('+(300+160*Math.sin(T*.21))+'px,'+(120+90*Math.cos(T*.17))+'px)'", "'translate('+(-100+160*Math.sin(T*.21))+'px,'+(200+140*Math.cos(T*.17))+'px)'");
rep("'translate('+(1050+140*Math.cos(T*.19))+'px,'+(520+110*Math.sin(T*.23))+'px)'", "'translate('+(250+140*Math.cos(T*.19))+'px,'+(1300+160*Math.sin(T*.23))+'px)'");
rep("'translate('+(700+260*Math.sin(T*.11))+'px,'+(260+120*Math.sin(T*.15))+'px)'", "'translate('+(200+200*Math.sin(T*.11))+'px,'+(800+200*Math.sin(T*.15))+'px)'");

// Subtitles (muted autoplay on Shorts/Reels)
rep('<div class="layer" id="stage"></div>',
  '<div class="layer" id="stage"></div><div id="sub" style="position:absolute;left:60px;right:60px;top:1730px;text-align:center;font:600 38px var(--f);line-height:1.3;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.9)"></div>');
rep("const S=${JSON.stringify(S)}, TOTAL=${TOTAL},", "const S=${JSON.stringify(S)}, LINES=${JSON.stringify(LINES)}, TOTAL=${TOTAL},");
rep("  const ee=enterExit(s,lt), vis=Math.min(ee.in,ee.out);",
  `  const ee=enterExit(s,lt), vis=Math.min(ee.in,ee.out);
  { const sub=document.getElementById('sub'), line=(LINES[s.vo-1]||'').replace('...','…').replace('tracebug dot dev','tracebug.dev'), v=Math.min(cl(prog(lt,.1,.25)),1-cl(prog(lt,s.voDur+.05,.25)));
    if(sub.dataset.l!==line){sub.dataset.l=line;sub.textContent=line} sub.style.opacity=v; sub.style.transform='translateY('+(12*(1-cl(prog(lt,.1,.3))))+'px)'; }`);

// out/ sits at the same depth as scripts/, so the generated file's own
// import.meta.url paths (HERE, REPO) still resolve correctly.
const out = new URL("../out/render-vertical.gen.mjs", import.meta.url);
fs.mkdirSync(new URL("../out/", import.meta.url), { recursive: true });
fs.writeFileSync(out, src);
await import(out.href);
