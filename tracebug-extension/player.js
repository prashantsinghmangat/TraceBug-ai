// TraceBug recording player logic — loaded by player.html (extension page).
// Kept in a separate file because MV3 extension-page CSP (script-src 'self')
// forbids inline <script>. Protocol documented in player.html.
(function () {
  var v = document.getElementById("v");
  var errEl = document.getElementById("err");
  var embedderOrigin = null;
  var embedderWin = null;
  var expectedS = 0;

  function reply(msg) {
    if (embedderWin && embedderOrigin) {
      try { embedderWin.postMessage(msg, embedderOrigin); } catch (e) {}
    }
  }

  function showError(message) {
    v.style.display = "none";
    errEl.style.display = "flex";
    reply({ type: "tb:player:error", message: String(message || "load failed") });
  }

  // Chrome MediaRecorder quirk (same fix as the inline player): a streamed
  // WebM has no duration header, so <video> reports Infinity / first-cluster
  // length. Seek far past the end to force a full scan, then snap back.
  function fixDurationThenPaint() {
    var d = v.duration;
    var broken = d === Infinity || isNaN(d) || (expectedS > 1 && d < expectedS - 1.5);
    console.info("[TraceBug player] metadata: duration=" + d + " broken=" + broken);
    if (!broken) { try { v.currentTime = 0.05; } catch (e) {} return; }
    var snapped = false;
    var snapBack = function () {
      if (snapped) return;
      snapped = true;
      v.removeEventListener("seeked", snapBack);
      try { v.currentTime = 0.05; } catch (e) {}
    };
    v.addEventListener("seeked", snapBack);
    // Safety net: if the far-seek's 'seeked' never fires (some MediaRecorder
    // streams), snap back anyway so the player isn't stuck at the end (black).
    setTimeout(snapBack, 2500);
    try { v.currentTime = 1e7; } catch (e) { snapBack(); }
  }

  // ── Trim support (the page's trim bar drives this player on sites whose
  // CSP blocks in-page video). Playback state goes up to the embedder; the
  // cut itself runs here, under the extension's CSP, the same way as
  // src/ui/video-trim.ts cutVideo(): play the kept range in a hidden <video>
  // and re-record it with captureStream (mozCaptureStream in Firefox).
  var loadedBlob = null;
  var loadedType = "video/webm";
  var cutJob = null; // { id, cancel() }

  function sendTime() {
    reply({ type: "tb:player:time", currentTime: v.currentTime || 0, duration: v.duration, paused: v.paused });
  }
  ["timeupdate", "seeked", "play", "pause", "durationchange", "loadedmetadata"].forEach(function (ev) {
    v.addEventListener(ev, sendTime);
  });

  function canCut() {
    var p = HTMLMediaElement.prototype;
    return typeof MediaRecorder !== "undefined" && (typeof p.captureStream === "function" || typeof p.mozCaptureStream === "function");
  }

  function cut(id, startS, endS, mimeType) {
    if (!loadedBlob) { reply({ type: "tb:player:cut-error", id: id, message: "recording not loaded" }); return; }
    if (!canCut()) { reply({ type: "tb:player:cut-error", id: id, message: "This browser can't cut video" }); return; }
    var url = URL.createObjectURL(loadedBlob);
    var hv = document.createElement("video");
    hv.playsInline = true;
    hv.preload = "auto";
    hv.setAttribute("style", "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1");
    document.body.appendChild(hv);
    var raf = 0, rec = null, done = false;
    var chunks = [];
    function cleanup() {
      if (raf) cancelAnimationFrame(raf);
      try { hv.pause(); } catch (e) {}
      hv.removeAttribute("src");
      try { hv.load(); } catch (e) {}
      hv.remove();
      URL.revokeObjectURL(url);
      cutJob = null;
    }
    function fail(message, aborted) {
      if (done) return;
      done = true;
      try { if (rec && rec.state !== "inactive") { rec.onstop = null; rec.stop(); } } catch (e) {}
      cleanup();
      reply({ type: "tb:player:cut-error", id: id, message: String(message || "cut failed"), aborted: !!aborted });
    }
    cutJob = { id: id, cancel: function () { fail("Cancelled", true); } };
    hv.addEventListener("error", function () { fail("The recording could not be decoded"); }, { once: true });
    hv.addEventListener("loadedmetadata", function () {
      hv.addEventListener("seeked", function () {
        if (done) return;
        var stream = typeof hv.captureStream === "function" ? hv.captureStream() : hv.mozCaptureStream();
        hv.volume = 0;
        var type = mimeType && MediaRecorder.isTypeSupported(mimeType) ? mimeType : "video/webm";
        hv.play().then(function () {
          var t0 = performance.now();
          (function waitTracks() {
            if (done) return;
            if (stream.getVideoTracks().length === 0 && performance.now() - t0 < 3000) { requestAnimationFrame(waitTracks); return; }
            rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2500000 });
            rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
            rec.onstop = function () {
              if (done) return;
              done = true;
              var out = new Blob(chunks, { type: type });
              cleanup();
              if (!out.size) { reply({ type: "tb:player:cut-error", id: id, message: "The cut produced no video" }); return; }
              out.arrayBuffer().then(function (buf) {
                if (embedderWin && embedderOrigin) {
                  try { embedderWin.postMessage({ type: "tb:player:cut-done", id: id, buffer: buf, mimeType: type }, embedderOrigin, [buf]); } catch (e) {}
                }
              });
            };
            rec.start(1000);
            var span = Math.max(0.001, endS - startS);
            var finish = function () { try { hv.pause(); } catch (e) {} if (rec.state !== "inactive") rec.stop(); };
            hv.addEventListener("ended", finish, { once: true });
            (function tick() {
              raf = 0;
              if (done) return;
              var t = hv.currentTime;
              reply({ type: "tb:player:cut-progress", id: id, fraction: Math.min(1, Math.max(0, (t - startS) / span)) });
              if (t >= endS || hv.ended) { finish(); return; }
              raf = requestAnimationFrame(tick);
            })();
          })();
        }).catch(function (err) { fail(err && err.message); });
      }, { once: true });
      try { hv.currentTime = startS; } catch (e) { fail(e && e.message); }
    }, { once: true });
    hv.src = url;
  }

  window.addEventListener("message", function (e) {
    var msg = e.data;
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "tb:player:load" && (msg.buffer instanceof ArrayBuffer || typeof msg.dataUrl === "string")) {
      // First load wins and pins the only origin we'll ever reply to.
      if (embedderOrigin && e.origin !== embedderOrigin) return;
      embedderOrigin = e.origin;
      embedderWin = e.source;
      expectedS = (Number(msg.durationMs) || 0) / 1000;
      v.addEventListener("loadedmetadata", fixDurationThenPaint, { once: true });
      v.addEventListener("error", function () { showError("video decode failed"); });
      if (msg.buffer instanceof ArrayBuffer) {
        // Primary transport: raw bytes via structured clone. NEVER a data:
        // URL — Chromium caps all URLs at 2MB, which silently breaks any
        // recording over ~1.5MB (fetch AND src both reject the URL).
        console.info("[TraceBug player] load: " + Math.round(msg.buffer.byteLength / 1024) + "KB buffer, expected " + expectedS + "s");
        var blob = new Blob([msg.buffer], { type: msg.mimeType || "video/webm" });
        loadedBlob = blob;
        loadedType = msg.mimeType || "video/webm";
        v.src = URL.createObjectURL(blob);
      } else {
        // Legacy small-payload path (only safe under the 2MB URL cap).
        console.info("[TraceBug player] load: " + Math.round(msg.dataUrl.length / 1024) + "KB dataUrl, expected " + expectedS + "s");
        fetch(msg.dataUrl)
          .then(function (r) { return r.blob(); })
          .then(function (b) { loadedBlob = b; v.src = URL.createObjectURL(b); })
          .catch(function (err) { showError(err && err.message); });
      }
      return;
    }

    // Everything below requires the pinned embedder.
    if (e.origin !== embedderOrigin) return;

    if (msg.type === "tb:player:seek-to") {
      // Trim preview: show this frame, paused.
      var st = Number(msg.seconds);
      if (isFinite(st)) { try { v.pause(); v.currentTime = st; } catch (err) {} }
    } else if (msg.type === "tb:player:pause") {
      try { v.pause(); } catch (err) {}
    } else if (msg.type === "tb:player:cut") {
      if (cutJob) return;
      var a = Number(msg.start), b = Number(msg.end);
      if (!isFinite(a) || !isFinite(b) || b <= a) { reply({ type: "tb:player:cut-error", id: msg.id, message: "bad range" }); return; }
      cut(msg.id, a, b, typeof msg.mimeType === "string" ? msg.mimeType : loadedType);
    } else if (msg.type === "tb:player:cut-cancel") {
      if (cutJob && cutJob.id === msg.id) cutJob.cancel();
    } else if (msg.type === "tb:player:seek") {
      var s = Number(msg.seconds);
      if (isFinite(s)) {
        try { v.currentTime = s; v.play().catch(function () {}); } catch (err) {}
      }
    } else if (msg.type === "tb:player:grab-frame") {
      try { if (!v.paused) v.pause(); } catch (err) {}
      if (!v.videoWidth || !v.videoHeight) {
        reply({ type: "tb:player:error", message: "video not ready" });
        return;
      }
      try {
        var canvas = document.createElement("canvas");
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
        reply({
          type: "tb:player:frame",
          dataUrl: canvas.toDataURL("image/png"),
          width: canvas.width,
          height: canvas.height,
          currentTime: v.currentTime || 0,
        });
      } catch (err) {
        reply({ type: "tb:player:error", message: "frame capture failed" });
      }
    }
  });

  // Announce readiness to whoever embedded us — the embedder validates our
  // origin (chrome-extension://…) before sending the recording.
  try { window.parent.postMessage({ type: "tb:player:ready" }, "*"); } catch (e) {}
})();
