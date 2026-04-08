// ── Voice recorder ────────────────────────────────────────────────────────
// Uses Web Speech API (SpeechRecognition) for free, browser-native speech-to-text.
// No external services, no API keys, no audio stored — only text transcripts.
// Works in Chrome, Edge, Brave, Opera (Chromium-based browsers).

export interface VoiceTranscript {
  id: string;
  timestamp: number;
  text: string;
  duration: number; // ms
}

let recognition: any = null;
let isRecording = false;
let transcript = "";
let interimTranscript = "";
let startTime = 0;
const transcripts: VoiceTranscript[] = [];

// Callbacks
let onTranscriptUpdate: ((text: string, interim: string) => void) | null = null;
let onStatusChange: ((status: "recording" | "stopped" | "error", message?: string) => void) | null = null;

/** Check if voice recording is supported in this browser */
export function isVoiceSupported(): boolean {
  return !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

/** Start voice recording */
export function startVoiceRecording(options?: {
  onUpdate?: (text: string, interim: string) => void;
  onStatus?: (status: "recording" | "stopped" | "error", message?: string) => void;
}): boolean {
  if (isRecording) return false;
  if (!isVoiceSupported()) {
    options?.onStatus?.("error", "Speech recognition not supported in this browser.");
    return false;
  }

  onTranscriptUpdate = options?.onUpdate || null;
  onStatusChange = options?.onStatus || null;

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";
  recognition.maxAlternatives = 1;

  transcript = "";
  interimTranscript = "";
  startTime = Date.now();

  recognition.onresult = (event: any) => {
    let final = "";
    let interim = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        final += result[0].transcript;
      } else {
        interim += result[0].transcript;
      }
    }

    if (final) {
      transcript += (transcript ? " " : "") + cleanTranscript(final.trim());
    }
    interimTranscript = interim;

    onTranscriptUpdate?.(transcript, interimTranscript);
  };

  recognition.onerror = (event: any) => {
    const errorMessages: Record<string, string> = {
      "not-allowed": "Microphone access denied. Please allow microphone permission.",
      "no-speech": "No speech detected. Try speaking louder.",
      "network": "Network error. Speech recognition requires an internet connection.",
      "audio-capture": "No microphone found. Please connect a microphone.",
      "aborted": "Recording was cancelled.",
    };

    const message = errorMessages[event.error] || `Speech recognition error: ${event.error}`;

    // "no-speech" is non-fatal — recognition continues
    if (event.error === "no-speech") return;

    isRecording = false;
    recognition = null;
    onStatusChange?.("error", message);
    onStatusChange = null;
    onTranscriptUpdate = null;
  };

  recognition.onend = () => {
    // Auto-restart if still supposed to be recording (handles browser timeout)
    if (isRecording) {
      try {
        recognition.start();
      } catch {
        isRecording = false;
        onStatusChange?.("stopped");
      }
      return;
    }
    onStatusChange?.("stopped");
  };

  try {
    recognition.start();
    isRecording = true;
    onStatusChange?.("recording");
    return true;
  } catch (err: any) {
    onStatusChange?.("error", err.message || "Failed to start voice recording.");
    return false;
  }
}

/** Stop voice recording and return the transcript */
export function stopVoiceRecording(): VoiceTranscript | null {
  if (!isRecording && !recognition) return null;

  isRecording = false;

  // Immediately notify UI that recording stopped (don't wait for async onend)
  onStatusChange?.("stopped");

  if (recognition) {
    try {
      recognition.onend = null; // Prevent double "stopped" callback
      recognition.stop();
    } catch {
      // Already stopped
    }
    recognition = null;
  }

  // Append any interim text that wasn't finalized
  if (interimTranscript.trim()) {
    transcript += (transcript ? " " : "") + cleanTranscript(interimTranscript.trim());
    interimTranscript = "";
  }

  if (!transcript.trim()) return null;

  const result: VoiceTranscript = {
    id: `voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: startTime,
    text: transcript.trim(),
    duration: Date.now() - startTime,
  };

  transcripts.push(result);
  onTranscriptUpdate = null;
  onStatusChange = null;

  return result;
}

/** Check if currently recording */
export function isVoiceRecording(): boolean {
  return isRecording;
}

/** Get the current transcript (including interim) */
export function getCurrentTranscript(): string {
  return transcript + (interimTranscript ? ` ${interimTranscript}` : "");
}

/** Get all saved transcripts from this session */
export function getVoiceTranscripts(): VoiceTranscript[] {
  return [...transcripts];
}

/** Clear all transcripts */
export function clearVoiceTranscripts(): void {
  transcripts.length = 0;
}

// ── Text cleanup ──────────────────────────────────────────────────────────

/** Clean up raw speech transcript — capitalize, fix punctuation */
function cleanTranscript(text: string): string {
  if (!text) return text;

  // Capitalize first letter
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // Add period at end if no punctuation
  if (!/[.!?]$/.test(text.trim())) {
    text = text.trim() + ".";
  }

  // Common speech cleanup patterns
  text = text
    // "period" / "comma" / "question mark" spoken as words
    .replace(/\bperiod\b/gi, ".")
    .replace(/\bcomma\b/gi, ",")
    .replace(/\bquestion mark\b/gi, "?")
    .replace(/\bexclamation mark\b/gi, "!")
    .replace(/\bnew line\b/gi, "\n")
    // Fix double spaces
    .replace(/\s+/g, " ")
    // Fix space before punctuation
    .replace(/\s+([.,!?])/g, "$1")
    // Capitalize after sentence-ending punctuation
    .replace(/([.!?])\s+([a-z])/g, (_m, p, c) => `${p} ${c.toUpperCase()}`);

  return text;
}
