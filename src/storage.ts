// ── localStorage-based storage engine ─────────────────────────────────────
// All session data lives in the browser. Nothing leaves the machine.

import { TraceBugEvent, StoredSession, Annotation, EnvironmentInfo, BugPriority } from "./types";

const SESSIONS_KEY = "tracebug_sessions";
const ACTIVE_SESSION_KEY = "tracebug_active_session";
// How the active session was armed. "events" = the toolbar's event-only
// tracking (no video); "video" = a screen recording. Persisted so a page
// navigation can tell them apart: an event-only session must RESUME capture
// on the next page, whereas a video session whose tab-share Chrome ended on
// navigation should finalize and open its ticket. See index.ts init/restore.
const ACTIVE_CAPTURE_MODE_KEY = "tracebug_active_capture_mode";
export type ActiveCaptureMode = "events" | "video";

// ── Session ID — record-driven lifecycle ────────────────────────────────
// A session ID is persisted when the user clicks Record, kept across page
// reloads, and cleared when the user clicks Stop. Page loads no longer
// auto-create a session — the dashboard list stays clean until recording.

/** Generate a fresh, unique session ID. */
export function generateSessionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "bt_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Read the persisted active session ID, or null if recording isn't armed. */
export function getActiveSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setActiveSessionId(id: string): void {
  try { localStorage.setItem(ACTIVE_SESSION_KEY, id); } catch {}
}

export function clearActiveSessionId(): void {
  try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
  // Mode is meaningless without an active session — clear the two together so
  // a stale "video"/"events" flag can't leak into the next session.
  try { localStorage.removeItem(ACTIVE_CAPTURE_MODE_KEY); } catch {}
}

/** How the active session was armed. Defaults to "events" when a session is
 *  active but no explicit mode was written (older sessions, defensive). */
export function getActiveCaptureMode(): ActiveCaptureMode | null {
  try {
    const v = localStorage.getItem(ACTIVE_CAPTURE_MODE_KEY);
    return v === "events" || v === "video" ? v : null;
  } catch {
    return null;
  }
}

export function setActiveCaptureMode(mode: ActiveCaptureMode): void {
  try { localStorage.setItem(ACTIVE_CAPTURE_MODE_KEY, mode); } catch {}
}

/** Back-compat: returns the active session ID or null. */
export function getSessionId(): string | null {
  return getActiveSessionId();
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

// ── Storage warnings ──────────────────────────────────────────────────────
// The storage engine has no UI access, so eviction / quota problems are
// broadcast as a DOM event. The toolbar listens and shows a toast — users
// must never lose data silently.

export interface StorageWarningDetail {
  code: "unsaved_evicted" | "events_trimmed" | "storage_full" | "near_full";
  message: string;
}

// Identical warnings are throttled per code: a full-storage state during an
// active recording would otherwise re-emit (and re-toast) on every ~1s flush
// retry. One event per code per window is enough — the stats count incidents,
// not retries. near_full additionally has its own 90/80% usage hysteresis.
const WARNING_THROTTLE_MS = 30_000;
const _lastWarnAt: Partial<Record<StorageWarningDetail["code"], number>> = {};

export function emitStorageWarning(detail: StorageWarningDetail): void {
  const now = Date.now();
  if (now - (_lastWarnAt[detail.code] ?? 0) < WARNING_THROTTLE_MS) return;
  _lastWarnAt[detail.code] = now;
  if (typeof console !== "undefined") console.warn(`[TraceBug] ${detail.message}`);
  recordStorageStat(detail.code);
  try {
    window.dispatchEvent(new CustomEvent<StorageWarningDetail>("tracebug:storage-warning", { detail }));
  } catch {}
}

/** Test hook: clears warning throttle + hysteresis + retry backoff so each
 *  test observes emissions independently. Not part of the public API. */
export function resetStorageWarningStateForTests(): void {
  for (const k of Object.keys(_lastWarnAt)) delete _lastWarnAt[k as StorageWarningDetail["code"]];
  _nearFullWarned = false;
  _refusedUntil = 0;
}

// ── Local storage-pressure stats ──────────────────────────────────────────
// Counts how often this browser hits storage pressure (near-full warnings,
// refused writes, evictions, screenshot-dropping saves). Local-only — nothing
// is ever transmitted. This is the decision gate for the v2.0 IndexedDB
// migration: `TraceBug.getStorageStats()` output pasted into a GitHub issue
// turns "is 5 MB enough?" from a guess into data.

const STATS_KEY = "tracebug_storage_stats";

export type StorageStatCode = StorageWarningDetail["code"] | "screenshots_dropped";

export interface StorageStats {
  counts: Partial<Record<StorageStatCode, number>>;
  firstAt: number | null;
  lastAt: number | null;
}

export function getStorageStats(): StorageStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { counts: {}, firstAt: null, lastAt: null };
}

export function recordStorageStat(code: StorageStatCode): void {
  // Best-effort: when storage is genuinely full this tiny write can fail too.
  // Acceptable — the near_full events leading up to it were already counted.
  try {
    const stats = getStorageStats();
    stats.counts[code] = (stats.counts[code] ?? 0) + 1;
    const now = Date.now();
    if (!stats.firstAt) stats.firstAt = now;
    stats.lastAt = now;
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {}
}

/** Typical per-origin localStorage quota. Browsers don't expose the real
 *  number for localStorage specifically, so the meter and the near-full
 *  warning both assume the common ~5 MB. */
export const QUOTA_ESTIMATE_BYTES = 5 * 1024 * 1024;

/** Approximate bytes the sessions blob occupies in localStorage
 *  (UTF-16 → 2 bytes per code unit). Used by the Saved Tickets meter. */
export function getStorageUsageBytes(): number {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? raw.length * 2 : 0;
  } catch {
    return 0;
  }
}

// After a fully-refused write (storage full of saved tickets), scheduled
// flushes back off instead of re-running the whole eviction + serialization
// gauntlet every second. Explicit flushes (unload, delete, Save Ticket)
// bypass the backoff — they're the user's last/best chance to persist.
const REFUSAL_BACKOFF_MS = 10_000;
let _refusedUntil = 0;

// Warn BEFORE writes start failing, not at the moment of failure — users need
// time to delete or export old tickets. Fires once when usage crosses 90% of
// the assumed quota; re-arms only after usage drops back under 80% so a user
// hovering around the threshold isn't toasted on every flush. `used` is passed
// in by saveSessions (it already has the serialized payload in hand) so this
// per-flush check doesn't re-read the multi-MB blob from localStorage.
let _nearFullWarned = false;
function maybeWarnNearFull(used: number): void {
  if (used >= QUOTA_ESTIMATE_BYTES * 0.9) {
    if (!_nearFullWarned) {
      _nearFullWarned = true;
      emitStorageWarning({
        code: "near_full",
        message: "Browser storage is nearly full. New tickets may lose screenshots or fail to save — delete or export old saved tickets.",
      });
    }
  } else if (used < QUOTA_ESTIMATE_BYTES * 0.8) {
    _nearFullWarned = false;
  }
}

function saveSessions(sessions: StoredSession[]): boolean {
  try {
    const json = JSON.stringify(sessions);
    localStorage.setItem(SESSIONS_KEY, json);
    // Only the clean-write path checks the early warning — the fallback paths
    // below emit their own, stronger warnings when quota is already exceeded.
    maybeWarnNearFull(json.length * 2);
    return true;
  } catch {
    // localStorage full. Free space *progressively* — the old code dropped a
    // single session and gave up, which silently lost every pending event when
    // one large session exceeded quota on its own.
  }

  // Mutate `sessions` in place as we trim so the caller's array (and the shared
  // _cachedSessions, which is passed straight in on flush) stays in sync with
  // what actually persisted.
  const commit = (next: StoredSession[]): boolean => {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
      sessions.length = 0;
      sessions.push(...next);
      return true;
    } catch {
      return false;
    }
  };

  // 1) Drop oldest UNSAVED sessions one at a time. Sessions the user
  //    explicitly saved (saved === true) are never evicted — only their own
  //    Delete / Clear All removes them. The MOST-RECENTLY-UPDATED session is
  //    also protected: it's the one whose write triggered this flush. (The
  //    array is creation-ordered, so the tail is not necessarily it — e.g.
  //    the user may be annotating an older session opened from a list.)
  const working = sessions.slice();
  let active: StoredSession | undefined;
  for (const s of working) {
    if (!active || (s.updatedAt || 0) >= (active.updatedAt || 0)) active = s;
  }
  let dropped = 0;
  let idx: number;
  while ((idx = working.findIndex((s) => !s.saved && s !== active)) !== -1) {
    working.splice(idx, 1);
    dropped++;
    if (commit(working)) {
      emitStorageWarning({
        code: "unsaved_evicted",
        message: `Browser storage full — removed ${dropped} old unsaved session${dropped === 1 ? "" : "s"} to make room. Saved tickets were kept.`,
      });
      return true;
    }
  }

  // 2) Only saved tickets + the active session remain — trial-halve the
  //    active session's oldest events (only if it isn't itself saved). The
  //    original events array is restored if no size fits: a refused write
  //    must leave the in-memory session exactly as the caller passed it.
  if (active && !active.saved && Array.isArray(active.events)) {
    const originalEvents = active.events;
    while (active.events.length > 1) {
      active.events = active.events.slice(Math.ceil(active.events.length / 2));
      if (commit(working)) {
        emitStorageWarning({
          code: "events_trimmed",
          message: "Browser storage full — trimmed older events from the current session to fit. Saved tickets were kept.",
        });
        return true;
      }
    }
    active.events = originalEvents;
  }

  // 3) Cannot persist without touching saved tickets — refuse and surface it.
  //    In-memory state is left exactly as passed in; whatever was last written
  //    to localStorage stays intact on disk. Back off scheduled retries so the
  //    (expensive) fallback above doesn't re-run every flush interval.
  _refusedUntil = Date.now() + REFUSAL_BACKOFF_MS;
  emitStorageWarning({
    code: "storage_full",
    message: "Browser storage is full of saved tickets — new data can't be saved. Delete old saved tickets to free space.",
  });
  return false;
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
// Only re-serialize when the cache actually changed since the last write.
// saveSessions() does a full JSON.stringify of every session; without this
// guard a burst of no-op flushes would repeat that whole cost for nothing.
let _dirty = false;
const FLUSH_INTERVAL_MS = 1000;

export function getCachedSessions(): StoredSession[] {
  if (!_cachedSessions) {
    _cachedSessions = getAllSessions();
  }
  return _cachedSessions;
}

export function scheduleFlush(): void {
  // Every mutation routes through here, so this is the authoritative
  // "something changed" signal — mark dirty before the early return.
  _dirty = true;
  if (_pendingFlush) return;
  _pendingFlush = setTimeout(() => {
    _pendingFlush = null;
    // Skip scheduled attempts while a refusal backoff is active — _dirty stays
    // set, so the next mutation reschedules and the check repeats cheaply.
    if (_cachedSessions && _dirty && Date.now() >= _refusedUntil) {
      // Keep _dirty on failure so the next mutation retries the write.
      if (saveSessions(_cachedSessions)) _dirty = false;
    }
  }, FLUSH_INTERVAL_MS);
}

/** Flush any pending writes immediately (called on beforeunload / destroy).
 *  Unconditional by design: several callers mutate the cache directly and
 *  then call this to persist NOW without going through scheduleFlush(), so it
 *  must always write when a cache exists. The dirty guard is only for the
 *  high-frequency scheduled path. */
export function flushPendingEvents(): boolean {
  if (_pendingFlush) {
    clearTimeout(_pendingFlush);
    _pendingFlush = null;
  }
  if (_cachedSessions) {
    const ok = saveSessions(_cachedSessions);
    if (ok) _dirty = false;
    return ok;
  }
  return true;
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
  _dirty = false;
}

// Flush on page unload so no events are lost. `beforeunload` alone is
// unreliable: browsers may skip it when a page enters the bfcache, and a link
// click can navigate that way. `pagehide` + `visibilitychange→hidden` are the
// recommended durable-write pair — all point at the synchronous flush, which
// is idempotent, so firing more than once is harmless.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushPendingEvents);
  window.addEventListener("pagehide", flushPendingEvents);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingEvents();
  });
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

  // Trim old sessions if over limit. Saved tickets are exempt: they neither
  // count toward maxSessions nor get evicted — only unsaved sessions rotate.
  const unsavedCount = sessions.filter((s) => !s.saved).length;
  if (unsavedCount > maxSessions) {
    let toDrop = unsavedCount - maxSessions;
    sessions = sessions.filter((s) => {
      if (toDrop > 0 && !s.saved && s !== session) {
        toDrop--;
        return false;
      }
      return true;
    });
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
  // Best-effort flush of pending mutations — this can be REFUSED when storage
  // is full, which is exactly when users delete tickets to free space. So the
  // survivor list is built from the CACHE, not from disk: the cache holds any
  // un-flushed mutations that a stale disk read would silently drop.
  flushPendingEvents();
  const remaining = getCachedSessions().filter((s) => s.sessionId !== sessionId);
  // Invalidate before writing so a stale pending flush can't resurrect the
  // deleted session or overwrite the new state.
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

// ── Save tester-assigned priority to session ─────────────────────────────

export function setSessionPriority(sessionId: string, priority: BugPriority): void {
  const sessions = getCachedSessions();
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (!session) return;

  session.priority = priority;
  session.updatedAt = Date.now();
  scheduleFlush();
}

// ── Mark session as explicitly saved by the user ─────────────────────────

export function markSessionSaved(sessionId: string): boolean {
  const sessions = getCachedSessions();
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (!session) return false;

  // Remember the prior state: on a failed flush we roll back ONLY a
  // fresh save. A ticket that was already saved before this call must keep
  // its flag — flipping it to false would make a durable saved ticket
  // evictable, breaking the "saved tickets never disappear" invariant.
  const wasSaved = session.saved === true;
  session.saved = true;
  session.updatedAt = Date.now();

  // Ask the browser to make this origin's storage durable so saved tickets
  // aren't evicted under disk pressure. Fire-and-forget; browsers may deny.
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {}

  // Flush immediately so the saved state survives page reloads. saveSessions
  // never evicts saved tickets, so `false` here means storage is truly full —
  // the caller should tell the user instead of pretending the save worked.
  const ok = flushPendingEvents();
  if (!ok && !wasSaved) session.saved = false;
  return ok;
}

// ── Clear everything ──────────────────────────────────────────────────────

export function clearAllSessions(): void {
  // Cancel any pending flush AND drop the cache before wiping storage,
  // otherwise a stale cache would be re-flushed and undo the clear.
  invalidateCache();
  try { localStorage.removeItem(SESSIONS_KEY); } catch {}
}
