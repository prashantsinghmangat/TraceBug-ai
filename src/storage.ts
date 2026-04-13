// ── localStorage-based storage engine ─────────────────────────────────────
// All session data lives in the browser. Nothing leaves the machine.

import { TraceBugEvent, StoredSession, Annotation, EnvironmentInfo } from "./types";

const SESSIONS_KEY = "tracebug_sessions";

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
      annotations: [],
      environment: null,
    };
    sessions.push(session);
    saveSessions(sessions);
  }
  return session;
}

// ── Batched writes — avoid blocking main thread on every event ────────────

let _cachedSessions: StoredSession[] | null = null;
let _pendingFlush: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 1000;

function getCachedSessions(): StoredSession[] {
  if (!_cachedSessions) {
    _cachedSessions = getAllSessions();
  }
  return _cachedSessions;
}

function scheduleFlush(): void {
  if (_pendingFlush) return;
  _pendingFlush = setTimeout(() => {
    _pendingFlush = null;
    if (_cachedSessions) {
      saveSessions(_cachedSessions);
    }
  }, FLUSH_INTERVAL_MS);
}

/** Flush any pending writes immediately (called on beforeunload / destroy) */
export function flushPendingEvents(): void {
  if (_pendingFlush) {
    clearTimeout(_pendingFlush);
    _pendingFlush = null;
  }
  if (_cachedSessions) {
    saveSessions(_cachedSessions);
  }
}

/**
 * Drop the in-memory cache + cancel any pending flush.
 * Used after destructive ops (clear, delete) so the next read re-hydrates
 * from localStorage and a stale pending flush can't overwrite the new state.
 */
function invalidateCache(): void {
  if (_pendingFlush) {
    clearTimeout(_pendingFlush);
    _pendingFlush = null;
  }
  _cachedSessions = null;
}

// Flush on page unload so no events are lost
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushPendingEvents);
}

// ── Append an event to a session ──────────────────────────────────────────

export function appendEvent(
  sessionId: string,
  event: TraceBugEvent,
  maxEvents: number,
  maxSessions: number
): void {
  let sessions = getCachedSessions();

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
      annotations: [],
      environment: null,
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
    _cachedSessions = sessions;
  }

  scheduleFlush();
}

// ── Update session with error + repro steps ───────────────────────────────
// Cache-aware: reads through the cache so pending in-memory events aren't lost,
// and schedules a flush instead of a direct write to avoid race with pending flushes.

export function updateSessionError(
  sessionId: string,
  errorMessage: string,
  errorStack: string | undefined,
  reproSteps: string,
  errorSummary: string
): void {
  const sessions = getCachedSessions();
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (!session) return;

  session.errorMessage = errorMessage;
  session.errorStack = errorStack || null;
  session.reproSteps = reproSteps;
  session.errorSummary = errorSummary;
  session.updatedAt = Date.now();

  scheduleFlush();
}

// ── Delete a single session ───────────────────────────────────────────────

export function deleteSession(sessionId: string): void {
  // Drop any pending flush first so it can't resurrect the deleted session
  const remaining = getAllSessions().filter((s) => s.sessionId !== sessionId);
  invalidateCache();
  saveSessions(remaining);
}

// ── Add annotation to session ────────────────────────────────────────────

export function addAnnotation(sessionId: string, annotation: Annotation): void {
  const sessions = getCachedSessions();
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (!session) return;

  if (!session.annotations) session.annotations = [];
  session.annotations.push(annotation);
  session.updatedAt = Date.now();
  scheduleFlush();
}

// ── Save environment info to session ─────────────────────────────────────

export function saveEnvironment(sessionId: string, env: EnvironmentInfo): void {
  const sessions = getCachedSessions();
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (!session) return;

  session.environment = env;
  scheduleFlush();
}

// ── Clear everything ──────────────────────────────────────────────────────

export function clearAllSessions(): void {
  // Cancel any pending flush AND drop the cache before wiping storage,
  // otherwise a stale cache would be re-flushed and undo the clear.
  invalidateCache();
  try { localStorage.removeItem(SESSIONS_KEY); } catch {}
}
