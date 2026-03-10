// ── localStorage-based storage engine ─────────────────────────────────────
// All session data lives in the browser. Nothing leaves the machine.

import { TraceBugEvent, StoredSession } from "./types";

const SESSIONS_KEY = "tracebug_sessions";
const SESSION_ID_KEY = "tracebug_session_id";

// ── Session ID (new session on every page load / refresh) ────────────────

export function getSessionId(): string {
  // Always generate a fresh session ID — each page load = new session
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "bt_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  return id;
}

// ── Read / write all sessions ─────────────────────────────────────────────

export function getAllSessions(): StoredSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: StoredSession[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // localStorage full — drop oldest session and retry once
    if (sessions.length > 1) {
      sessions.shift();
      try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
      } catch {
        // give up silently
      }
    }
  }
}

// ── Get or create the current session ─────────────────────────────────────

export function getOrCreateSession(
  sessionId: string,
  projectId: string
): StoredSession {
  const sessions = getAllSessions();
  let session = sessions.find((s) => s.sessionId === sessionId);
  if (!session) {
    session = {
      sessionId,
      projectId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      errorMessage: null,
      errorStack: null,
      reproSteps: null,
      errorSummary: null,
      events: [],
    };
    sessions.push(session);
    saveSessions(sessions);
  }
  return session;
}

// ── Append an event to a session ──────────────────────────────────────────

export function appendEvent(
  sessionId: string,
  event: TraceBugEvent,
  maxEvents: number,
  maxSessions: number
): void {
  let sessions = getAllSessions();

  let session = sessions.find((s) => s.sessionId === sessionId);
  if (!session) {
    session = {
      sessionId,
      projectId: event.projectId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      errorMessage: null,
      errorStack: null,
      reproSteps: null,
      errorSummary: null,
      events: [],
    };
    sessions.push(session);
  }

  session.events.push(event);
  session.updatedAt = Date.now();

  // Trim events if over limit (keep most recent)
  if (session.events.length > maxEvents) {
    session.events = session.events.slice(-maxEvents);
  }

  // Trim old sessions if over limit
  if (sessions.length > maxSessions) {
    sessions = sessions.slice(-maxSessions);
  }

  saveSessions(sessions);
}

// ── Update session with error + repro steps ───────────────────────────────

export function updateSessionError(
  sessionId: string,
  errorMessage: string,
  errorStack: string | undefined,
  reproSteps: string,
  errorSummary: string
): void {
  const sessions = getAllSessions();
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (!session) return;

  session.errorMessage = errorMessage;
  session.errorStack = errorStack || null;
  session.reproSteps = reproSteps;
  session.errorSummary = errorSummary;
  session.updatedAt = Date.now();

  saveSessions(sessions);
}

// ── Delete a single session ───────────────────────────────────────────────

export function deleteSession(sessionId: string): void {
  const sessions = getAllSessions().filter((s) => s.sessionId !== sessionId);
  saveSessions(sessions);
}

// ── Clear everything ──────────────────────────────────────────────────────

export function clearAllSessions(): void {
  localStorage.removeItem(SESSIONS_KEY);
}
