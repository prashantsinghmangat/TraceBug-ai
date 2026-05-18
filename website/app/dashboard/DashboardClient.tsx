"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

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
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-md bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-sm font-bold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{workspaceName}</div>
              <div className="text-xs text-gray-500 truncate">{email}</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <SidebarLink active={filter === "all"} onClick={() => setFilter("all")} icon="📦" label="All Shares" count={sessions.length} />
          <SidebarLink active={filter === "video"} onClick={() => setFilter("video")} icon="🎥" label="Video Shares" count={videoUsed} />
          <SidebarLink active={filter === "screenshot"} onClick={() => setFilter("screenshot")} icon="📸" label="Screenshot Shares" count={screenshotUsed} />

          <div className="pt-6 pb-2 px-3 text-xs uppercase tracking-wide text-gray-500">Folders</div>
          <div className="px-3 py-2 text-xs text-gray-600">Coming soon</div>
        </nav>

        <div className="p-3 border-t border-gray-800 space-y-3">
          <div className="rounded-md border border-gray-800 bg-gray-950 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-300">Free Plan</span>
              <button
                className="text-xs px-2 py-1 rounded bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 cursor-not-allowed"
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
            className="w-full text-xs text-gray-400 hover:text-gray-200 py-2 rounded hover:bg-gray-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0">
        <header className="border-b border-gray-800 px-8 py-5 flex items-center gap-4">
          <h1 className="text-xl font-semibold">
            {filter === "all" ? "All Shares" : filter === "video" ? "Video Shares" : "Screenshot Shares"}
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <input
              type="search"
              placeholder="Search shares…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-sm w-64 focus:border-violet-500 focus:outline-none"
            />
            <button
              className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-sm font-medium text-white"
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

function SidebarLink({ active, onClick, icon, label, count }: {
  active: boolean; onClick: () => void; icon: string; label: string; count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
        active ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800/60"
      }`}
    >
      <span className="text-base">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {count > 0 && <span className="text-xs text-gray-500">{count}</span>}
    </button>
  );
}

function MiniQuota({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span className="tabular-nums">{used}/{limit}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full ${used >= limit ? "bg-amber-500" : "bg-violet-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-lg border border-dashed border-gray-800 p-16 text-center">
      <div className="inline-block h-6 w-6 rounded-full border-2 border-gray-700 border-t-violet-400 animate-spin mb-3" />
      <p className="text-sm text-gray-500">Loading your shares…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-red-900 bg-red-950/30 p-12 text-center">
      <div className="text-3xl mb-3">⚠️</div>
      <p className="text-sm text-red-300 mb-4">Couldn&apos;t load shares: {message}</p>
      <button onClick={onRetry} className="text-sm text-violet-400 hover:text-violet-300">Retry</button>
    </div>
  );
}

function EmptyState({ filter, hasAny, onClear }: { filter: Filter; hasAny: boolean; onClear: () => void }) {
  if (!hasAny) {
    return (
      <div className="rounded-lg border border-dashed border-gray-800 p-16 text-center">
        <div className="text-4xl mb-4">📭</div>
        <h3 className="text-lg font-medium mb-2">No shares yet</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
          Install the TraceBug SDK or Chrome extension on your site, capture a bug, and click 🔗 Share link in the bug ticket modal.
        </p>
        <a href="/docs" target="_blank" rel="noreferrer" className="text-sm text-violet-400 hover:text-violet-300">View docs →</a>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-gray-800 p-12 text-center">
      <p className="text-sm text-gray-500 mb-4">No {filter === "video" ? "video" : "screenshot"} shares match your filters.</p>
      <button onClick={onClear} className="text-sm text-violet-400 hover:text-violet-300">Clear filters</button>
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
  const expiryColor = daysLeft <= 1 ? "text-red-400" : daysLeft <= 3 ? "text-amber-400" : "text-gray-500";
  const createdAgo = timeAgo(new Date(s.created_at));
  const duration = s.has_video && s.video_duration_s ? formatDuration(s.video_duration_s) : null;
  const sizeMb = (s.size_bytes / 1024 / 1024).toFixed(1);

  return (
    <article className="group rounded-lg border border-gray-800 bg-gray-900 overflow-hidden hover:border-gray-700 transition-colors">
      <a href={shareUrl} target="_blank" rel="noreferrer" className="block relative aspect-video overflow-hidden"
         style={s.thumbnail ? undefined : { background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}>
        {s.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl opacity-50">{s.has_video ? "🎥" : "📸"}</span>
          </div>
        )}
        {/* Play overlay — shown only for video shares so they're visually
            distinct from static screenshot shares at a glance. */}
        {s.has_video && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-14 h-14 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white" className="ml-1">
                <path d="M8 5v14l11-7z"/>
              </svg>
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
        <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-sm rounded px-2 py-1">
          <span className="text-xs font-medium text-white">{s.has_video ? "🎥 Video" : "📸 Shot"}</span>
        </div>
        <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded px-2 py-1">
          {duration ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
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
          <span className="text-xs text-gray-500 shrink-0">{createdAgo}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={expiryColor}>
            Expires in {daysLeft}d{s.extended_count > 0 ? ` · ext ${s.extended_count}×` : ""}
          </span>
          <span className="text-gray-500 tabular-nums">{sizeMb} MB</span>
        </div>

        <div className="mt-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-700 hover:bg-gray-800"
          >Copy</button>
          <button
            onClick={onExtend}
            disabled={pending}
            className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-700 hover:bg-gray-800 disabled:opacity-50"
          >Extend</button>
          <button
            onClick={onDelete}
            disabled={pending}
            className="px-2 py-1.5 text-xs rounded border border-red-900 text-red-400 hover:bg-red-900/30 disabled:opacity-50"
            title="Delete"
          >🗑</button>
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
