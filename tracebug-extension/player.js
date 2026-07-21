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
        v.src = URL.createObjectURL(blob);
      } else {
        // Legacy small-payload path (only safe under the 2MB URL cap).
        console.info("[TraceBug player] load: " + Math.round(msg.dataUrl.length / 1024) + "KB dataUrl, expected " + expectedS + "s");
        fetch(msg.dataUrl)
          .then(function (r) { return r.blob(); })
          .then(function (b) { v.src = URL.createObjectURL(b); })
          .catch(function (err) { showError(err && err.message); });
      }
      return;
    }

    // Everything below requires the pinned embedder.
    if (e.origin !== embedderOrigin) return;

    if (msg.type === "tb:player:seek") {
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
