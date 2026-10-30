# Demo video

Source for the ~57 s TraceBug demo video: a tester captures a real bug in a small
checkout page, hands the report to Claude Code, and Claude fixes it
(`$129.00 → $103.20`). Two cuts come out of the same edit: 16:9 (YouTube, website,
Product Hunt, Chrome Web Store promo) and 9:16 with burned-in subtitles (Shorts,
Reels, TikTok).

Everything here is marketing tooling. None of it ships in the SDK, the extension
or the CLI.

```
demo-video/
  demo-shop/          the checkout page that gets recorded (has the bug on purpose)
  narration.txt       one narration line per scene, in scene order
  scripts/
    voiceover.mjs     narration.txt -> out/vo/l1.mp3 … (edge-tts, AndrewNeural)
    render.mjs        16:9 video: scenes, zooms, captions, title cards
    render-vertical.mjs  9:16 layout + subtitles, derived from render.mjs
    mix.mjs           music bed, voice-over, SFX -> final MP4
  clips/              raw screen recordings (gitignored, see below)
  out/                everything generated (gitignored)
```

## What you need

- Node 18+ and this repo's dev dependencies (`npm ci` at the repo root; the
  scripts use its Playwright Chromium for rendering).
- `ffmpeg` on `PATH` (`winget install Gyan.FFmpeg`).
- For the narrator: `python -m pip install edge-tts`. It sends only the
  narration text to Microsoft's Edge read-aloud service.

## Recording the clips

1. Serve the shop: `npx serve marketing/demo-video/demo-shop -l 3000`.
   `coupons.js` is missing `SAVE20` while the banner advertises it. That is the bug.
2. Use a clean Chrome profile with the TraceBug extension loaded unpacked from
   `tracebug-extension/` (so the recording shows the current build), DevTools
   docked right on the Console, 1920×1080, notifications off.
3. Record (OBS is fine) and save into `marketing/demo-video/clips/`:

| File | What to record |
|---|---|
| `01-install.mp4` | Chrome Web Store page → Add to Chrome → the welcome page |
| `04-claude-fix.mp4` | One take: TraceBug icon → Capture Bug → type `SAVE20` → Apply coupon (error) → Stop → ticket, Console tab → **Fix with AI** (prompt copied) → VS Code, paste into Claude Code with the line *"I typed SAVE20, the Black Friday code from the banner, and clicked Apply coupon."* → let it fix `coupons.js` |
| `05-proof.mp4` | Reload → type `SAVE20` → Apply → hold on "SAVE20 applied" and **$103.20** |

Type `SAVE20` **after** starting the capture, and click **Discard** if the ticket
shows a "Restored draft" pill. TraceBug does not record what is typed into text
fields (privacy), which is why the extra line for Claude is needed. Before each
retake, put the bug back:
`git checkout -- marketing/demo-video/demo-shop`.

The scenes cut into these takes by timestamp (`src.ss` / `src.to` in
`scripts/render.mjs`), so **after re-recording, re-check those timestamps**:
grab frames with `ffmpeg -ss <t> -i clips/04-claude-fix.mp4 -frames:v 1 f.png`.

## Building

From `marketing/demo-video/`:

```
node scripts/voiceover.mjs          # once, or after editing narration.txt
node scripts/render.mjs             # ~10 min, -> out/parts/video-16x9.mp4
node scripts/mix.mjs                # -> out/TraceBug-demo-16x9.mp4
node scripts/render-vertical.mjs    # ~10 min, -> out/parts/video-9x16.mp4
node scripts/mix.mjs 9x16           # -> out/TraceBug-demo-9x16.mp4
```

Recordings somewhere else? `CLIPS=C:/path/to/recordings node scripts/render.mjs`.

To preview or fix one scene, pass its id (`problem`, `brand`, `install`,
`capture`, `report`, `prompt`, `claude`, `fix`, `proof`, `tools`, `cta`):
`node scripts/render.mjs capture` writes just that scene's frames into
`out/frames-16x9/` and re-encodes once the full sequence is there. Look at a
frame with any image viewer before re-rendering everything.

## Changing things

- **Words spoken:** edit `narration.txt` (line N is scene N), rerun
  `voiceover.mjs`. Scene lengths follow the narration automatically.
- **On-screen text, zoom, callouts:** the `S` array at the top of
  `render.mjs`. `zoom` keys are `[time, zoom, focusX, focusY]` with the focus as
  a 0–1 point of the clip kept centred; `chips` are `[showAt, hideAt, text,
  style, corner]`. Vertical zoom keys live in `VZ` in `render-vertical.mjs`.
- **Look:** the CSS inside `render.mjs` (dark indigo background, brand colours
  `#4F46E5` / `#818CF8`, Segoe UI). The logo is read from
  `tracebug-extension/icons/icon128.svg`.
- **Music:** `mix.mjs` synthesizes an original 96 BPM bed (no licensing
  issues). To use a licensed track instead, replace the `[mus]` chain with an
  `-i track.mp3` input; the voice-ducking stays.

## Cleaning up

`out/` (frames, footage, renders: several GB while building) can be deleted at
any time; it is all regenerated. Keep `clips/` until the video is final.
