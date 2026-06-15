"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Package,
  Video,
  Image as ImageIcon,
  Inbox,
  Trash2,
  Play,
  Camera,
  type LucideIcon,
} from "lucide-react";

interface SessionItem {
  id: string;
  share_token: string;
  title: string | null;
  size_bytes: number;
  has_video: boolean;
  video_duration_s: number | null;
  screenshot_count: number;
  created_at: string;
  expires_at: string;
  extended_count: number;
  thumbnail: string | null;
}

type Filter = "all" | "video" | "screenshot";

// Hard-coded here because they're constants in the SDK quota model and avoids
// an extra round-trip to /api/me just to know "5 and 10".
const VIDEO_LIMIT = 5;
const SCREENSHOT_LIMIT = 10;

export default function DashboardClient({
  email,
  siteUrl,
}: {
  email: string;
  siteUrl: string;
}) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [, startTransition] = useTransition();

  // Fetch sessions on mount. /api/sessions reads the cookie session and
  // returns the current user's active shares. If this works in a browser tab
  // (which it does — user verified the JSON), it'll work here.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/sessions", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setSessions(json.sessions ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const videoUsed = sessions.filter((s) => s.has_video).length;
  const screenshotUsed = sessions.length - videoUsed;
  const quotas = {
    video: { used: videoUsed, limit: VIDEO_LIMIT },
    screenshot: { used: screenshotUsed, limit: SCREENSHOT_LIMIT },
  };

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (filter === "video" && !s.has_video) return false;
      if (filter === "screenshot" && s.has_video) return false;
      if (search && !(s.title || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [sessions, filter, search]);

  async function deleteSession(id: string) {
    if (!confirm("Delete this share permanently?")) return;
    setPendingId(id);
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setPendingId(null);
    if (res.ok || res.status === 204) {
      setSessions((rows) => rows.filter((r) => r.id !== id));
    } else {
      alert("Delete failed");
    }
  }

  async function extendSession(id: string) {
    setPendingId(id);
    const res = await fetch(`/api/sessions/${id}/extend`, { method: "POST" });
    setPendingId(null);
    if (!res.ok) { alert("Extend failed"); return; }
    const { expiresAt, extendedCount } = await res.json();
    setSessions((rows) =>
      rows.map((r) => (r.id === id ? { ...r, expires_at: expiresAt, extended_count: extendedCount } : r)),
    );
  }

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    startTransition(() => { window.location.href = "/auth"; });
  }

  const workspaceName = email.split("@")[0] || "Workspace";
  const initial = workspaceName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background text-text-primary flex">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center text-sm font-bold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{workspaceName}</div>
              <div className="text-xs text-text-subtle truncate">{email}</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <SidebarLink active={filter === "all"} onClick={() => setFilter("all")} Icon={Package} label="All Shares" count={sessions.length} />
          <SidebarLink active={filter === "video"} onClick={() => setFilter("video")} Icon={Video} label="Video Shares" count={videoUsed} />
          <SidebarLink active={filter === "screenshot"} onClick={() => setFilter("screenshot")} Icon={ImageIcon} label="Screenshot Shares" count={screenshotUsed} />

          <div className="pt-6 pb-2 px-3 text-xs uppercase tracking-wide text-text-subtle">Folders</div>
          <div className="px-3 py-2 text-xs text-text-subtle">Coming soon</div>
        </nav>

        <div className="p-3 border-t border-border space-y-3">
          <div className="rounded-md border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-primary">Free Plan</span>
              <button
                className="text-xs px-2 py-1 rounded bg-primary/15 text-primary hover:bg-primary/25 cursor-not-allowed"
                title="Coming soon"
              >
                Upgrade
              </button>
            </div>
            <MiniQuota label="Video" used={videoUsed} limit={quotas.video.limit} />
            <MiniQuota label="Screen" used={screenshotUsed} limit={quotas.screenshot.limit} />
          </div>
          <button
            onClick={signOut}
            className="w-full text-xs text-text-muted hover:text-text-primary py-2 rounded hover:bg-surface-2 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0">
        <header className="border-b border-border px-8 py-5 flex items-center gap-4">
          <h1 className="text-xl font-semibold">
            {filter === "all" ? "All Shares" : filter === "video" ? "Video Shares" : "Screenshot Shares"}
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <input
              type="search"
              placeholder="Search shares…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm w-64 text-text-primary focus:border-primary focus:outline-none"
            />
            <button
              className="px-4 py-2 rounded-md bg-primary hover:brightness-110 text-sm font-medium text-white"
              onClick={() => alert("Install the TraceBug SDK or Chrome extension on your site, then click 🔗 Share link in the bug ticket modal.")}
            >
              + Create Share
            </button>
          </div>
        </header>

        <div className="p-8">
          {loading ? (
            <LoadingState />
          ) : loadError ? (
            <ErrorState message={loadError} onRetry={() => window.location.reload()} />
          ) : filtered.length === 0 ? (
            <EmptyState filter={filter} hasAny={sessions.length > 0} onClear={() => { setFilter("all"); setSearch(""); }} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((s) => (
                <ShareCard
                  key={s.id}
                  session={s}
                  siteUrl={siteUrl}
                  workspaceInitial={initial}
                  workspaceName={workspaceName}
                  pending={pendingId === s.id}
                  onDelete={() => deleteSession(s.id)}
                  onExtend={() => extendSession(s.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function SidebarLink({ active, onClick, Icon, label, count }: {
  active: boolean; onClick: () => void; Icon: LucideIcon; label: string; count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-text-muted hover:text-text-primary hover:bg-surface-2"
      }`}
    >
      <Icon size={15} strokeWidth={1.75} className="flex-shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {count > 0 && <span className="text-xs text-text-subtle tabular-nums">{count}</span>}
    </button>
  );
}

function MiniQuota({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between text-xs text-text-muted mb-1">
        <span>{label}</span>
        <span className="tabular-nums">{used}/{limit}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className={`h-full ${used >= limit ? "bg-warning" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-lg border border-dashed border-border p-16 text-center">
      <div className="inline-block h-6 w-6 rounded-full border-2 border-border border-t-primary animate-spin mb-3" />
      <p className="text-sm text-text-muted">Loading your shares…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-error/30 bg-error/10 p-12 text-center">
      <div className="text-3xl mb-3">⚠️</div>
      <p className="text-sm text-error mb-4">Couldn&apos;t load shares: {message}</p>
      <button onClick={onRetry} className="text-sm text-primary hover:text-primary/80">Retry</button>
    </div>
  );
}

function EmptyState({ filter, hasAny, onClear }: { filter: Filter; hasAny: boolean; onClear: () => void }) {
  if (!hasAny) {
    return (
      <div className="rounded-lg border border-dashed border-border p-16 text-center">
        <Inbox size={36} strokeWidth={1.5} className="mx-auto mb-4 text-text-subtle" />
        <h3 className="text-lg font-medium mb-2">No shares yet</h3>
        <p className="text-sm text-text-muted mb-6 max-w-md mx-auto">
          Install the TraceBug SDK or Chrome extension on your site, capture a bug, and click Share link in the bug ticket modal.
        </p>
        <a href="/docs" target="_blank" rel="noreferrer" className="text-sm text-primary hover:text-primary/80">View docs →</a>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-border p-12 text-center">
      <p className="text-sm text-text-muted mb-4">No {filter === "video" ? "video" : "screenshot"} shares match your filters.</p>
      <button onClick={onClear} className="text-sm text-primary hover:text-primary/80">Clear filters</button>
    </div>
  );
}

// Deterministic gradient pair per share token — gives every card a unique
// thumbnail without storing real screenshots.
const GRADIENTS: [string, string][] = [
  ["#7c3aed", "#06b6d4"],
  ["#ec4899", "#f59e0b"],
  ["#10b981", "#3b82f6"],
  ["#f43f5e", "#8b5cf6"],
  ["#06b6d4", "#10b981"],
  ["#f59e0b", "#ec4899"],
  ["#8b5cf6", "#06b6d4"],
  ["#3b82f6", "#ec4899"],
];

function gradientFor(token: string): [string, string] {
  let h = 0;
  for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

function ShareCard({
  session: s, siteUrl, workspaceInitial, workspaceName, pending, onDelete, onExtend,
}: {
  session: SessionItem;
  siteUrl: string;
  workspaceInitial: string;
  workspaceName: string;
  pending: boolean;
  onDelete: () => void;
  onExtend: () => void;
}) {
  const shareUrl = `${siteUrl}/share/${s.share_token}`;
  const [from, to] = gradientFor(s.share_token);
  const daysLeft = Math.floor((+new Date(s.expires_at) - Date.now()) / 86400_000);
  const expiryColor = daysLeft <= 1 ? "text-error" : daysLeft <= 3 ? "text-warning" : "text-text-subtle";
  const createdAgo = timeAgo(new Date(s.created_at));
  const duration = s.has_video && s.video_duration_s ? formatDuration(s.video_duration_s) : null;
  const sizeMb = (s.size_bytes / 1024 / 1024).toFixed(1);

  return (
    <article className="group rounded-lg border border-border bg-surface overflow-hidden shadow-card hover:border-border-strong transition-colors">
      <a href={shareUrl} target="_blank" rel="noreferrer" className="block relative aspect-video overflow-hidden"
         style={s.thumbnail ? undefined : { background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}>
        {s.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/35">
            {s.has_video ? <Video size={44} strokeWidth={1.5} /> : <Camera size={44} strokeWidth={1.5} />}
          </div>
        )}
        {/* Play overlay — shown only for video shares so they're visually
            distinct from static screenshot shares at a glance. */}
        {s.has_video && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-14 h-14 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center">
              <Play size={22} fill="white" stroke="white" className="ml-1" />
            </div>
          </div>
        )}
        {/* Top gradient so the badge stays readable over any thumbnail */}
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full px-2 py-1">
          <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white">
            {workspaceInitial}
          </div>
          <span className="text-xs font-medium text-white">{workspaceName}</span>
        </div>
        {/* Type badge — clarifies video vs screenshot at a glance */}
        <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-sm rounded px-2 py-1 flex items-center gap-1.5">
          {s.has_video ? <Video size={11} strokeWidth={2} className="text-white" /> : <Camera size={11} strokeWidth={2} className="text-white" />}
          <span className="text-xs font-medium text-white">{s.has_video ? "Video" : "Shot"}</span>
        </div>
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded px-2 py-1">
          {duration ? (
            <>
              <Play size={10} fill="white" stroke="white" />
              <span className="text-xs font-medium text-white tabular-nums">{duration}</span>
            </>
          ) : (
            <span className="text-xs font-medium text-white">{s.screenshot_count} {s.screenshot_count === 1 ? "shot" : "shots"}</span>
          )}
        </div>
      </a>

      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h3 className="text-sm font-medium truncate flex-1" title={s.title || "Untitled"}>
            {s.title || "Untitled bug report"}
          </h3>
          <span className="text-xs text-text-subtle shrink-0">{createdAgo}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={expiryColor}>
            Expires in {daysLeft}d{s.extended_count > 0 ? ` · ext ${s.extended_count}×` : ""}
          </span>
          <span className="text-text-subtle tabular-nums">{sizeMb} MB</span>
        </div>

        <div className="mt-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            className="flex-1 px-2 py-1.5 text-xs rounded border border-border text-text-primary hover:bg-surface-2"
          >Copy</button>
          <button
            onClick={onExtend}
            disabled={pending}
            className="flex-1 px-2 py-1.5 text-xs rounded border border-border text-text-primary hover:bg-surface-2 disabled:opacity-50"
          >Extend</button>
          <button
            onClick={onDelete}
            disabled={pending}
            className="px-2.5 py-1.5 text-xs rounded border border-error/30 text-error hover:bg-error/10 disabled:opacity-50 flex items-center justify-center"
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 size={13} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </article>
  );
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - +date) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString();
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
