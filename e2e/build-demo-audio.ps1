# Builds a synced voiceover for demo.webm and muxes a final MP4 (H.264 + AAC).
# - Synthesizes each narration line with Windows offline TTS (System.Speech).
# - Reads marks.json (timestamps recorded during the Playwright run) and delays
#   each line to its beat, mixes them, and lays the track under the video.
# - Also exports demo-15s.mp4 (CWS card) and demo-6s.gif (README).
# Run: powershell -File e2e/build-demo-audio.ps1
$ErrorActionPreference = "Stop"
$dir = "D:\tmp\tracebug-video"
$ff  = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg*" -Recurse -Filter ffmpeg.exe | Select-Object -First 1).FullName
if (-not $ff) { throw "ffmpeg not found" }

# Narration keyed by the marks written during recording. A.I. -> spoken "AY EYE".
# Kept short so each line fits its scene window; a tempo clamp below is the
# safety net if any line still runs long.
$lines = [ordered]@{
  intro    = "TraceBug. Capture the bug, and let A I fix it."
  bug      = "A bug just happened in the browser."
  capture  = "One shortcut captures everything that broke."
  evidence = "It's not a screenshot. It's the actual evidence."
  handoff  = "Hand it to your A I agent, with one command."
  proof    = "The agent reads the real evidence and finds the root cause, in five tool calls."
  outro    = "Capture the bug, let A I fix it. Free, and local first."
}

# ── Synthesize each line to a mono 44.1kHz WAV ──────────────────────────────
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
# Prefer a clearer voice if present.
foreach ($v in @("Microsoft Zira Desktop","Microsoft David Desktop")) {
  try { $synth.SelectVoice($v); break } catch {}
}
$synth.Rate = -1   # slightly slower reads clearer
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($k in $lines.Keys) {
  $wav = Join-Path $dir "vo_$k.wav"
  $synth.SetOutputToWaveFile($wav, $fmt)
  $synth.Speak($lines[$k])
}
$synth.SetOutputToNull(); $synth.Dispose()
Write-Output "Synthesized $($lines.Count) narration lines."

$ffprobe = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg*" -Recurse -Filter ffprobe.exe | Select-Object -First 1).FullName

# ── Read marks (timestamps) + video length ──────────────────────────────────
$marks = @{}
(Get-Content (Join-Path $dir "marks.json") -Raw | ConvertFrom-Json) | ForEach-Object { $marks[$_.id] = [double]$_.t }
$vidDur = [double](& $ffprobe -v error -show_entries format=duration -of csv=p=0 (Join-Path $dir "demo.webm"))
$offset = 0.15  # small lead-in so VO doesn't clip the caption entrance
$guard  = 0.30  # required silence before the next line starts

# ── Assemble ffmpeg args: video + all VO WAVs, fit each to its window, mix ───
$order = @($lines.Keys)
$inputs = @("-i", (Join-Path $dir "demo.webm"))
$filters = @()
$mixLabels = @()
for ($i = 0; $i -lt $order.Count; $i++) {
  $k = $order[$i]
  $wav = Join-Path $dir "vo_$k.wav"
  $inputs += @("-i", $wav)
  $dur = [double](& $ffprobe -v error -show_entries format=duration -of csv=p=0 $wav)
  # Window = time until the next beat (or clip end for the last line), minus a guard.
  $nextT = if ($i -lt $order.Count - 1) { $marks[$order[$i + 1]] } else { $vidDur }
  $window = [math]::Max(1.0, $nextT - $marks[$k] - $guard)
  # Speed the line up ONLY if it would overrun its window (atempo caps at 2.0).
  $tempo = [math]::Min(2.0, [math]::Max(1.0, $dur / $window))
  $delayMs = [int]([math]::Max(0, $marks[$k] + $offset) * 1000)
  $idx = $i + 1
  $stage = if ($tempo -gt 1.01) { "atempo=$([math]::Round($tempo,3)),adelay=$($delayMs):all=1" } else { "adelay=$($delayMs):all=1" }
  $filters += "[$idx]$stage[a$idx]"
  $mixLabels += "[a$idx]"
  Write-Output ("{0,-9} dur={1,5:N2}s win={2,5:N2}s tempo={3:N2}" -f $k, $dur, $window, $tempo)
}
$n = $mixLabels.Count
$filterComplex = ($filters -join ";") + ";" + ($mixLabels -join "") + "amix=inputs=$($n):normalize=0:dropout_transition=0[mix]"

$mp4 = Join-Path $dir "demo.mp4"
& $ff -y @inputs -filter_complex $filterComplex `
  -map "0:v" -map "[mix]" `
  -c:v libx264 -pix_fmt yuv420p -crf 22 -preset medium -movflags +faststart `
  -c:a aac -b:a 160k -shortest $mp4
Write-Output "Wrote $mp4"

# ── Cutdowns ────────────────────────────────────────────────────────────────
& $ff -y -i $mp4 -t 15 -c:v libx264 -pix_fmt yuv420p -crf 22 -movflags +faststart -c:a aac -b:a 160k (Join-Path $dir "demo-15s.mp4")
& $ff -y -i $mp4 -t 6 -vf "fps=12,scale=760:-1:flags=lanczos" (Join-Path $dir "demo-6s.gif")
Write-Output "Wrote demo-15s.mp4 + demo-6s.gif"

Get-ChildItem $dir -Filter "demo*" | Select-Object Name, @{N='MB';E={[math]::Round($_.Length/1MB,2)}}
