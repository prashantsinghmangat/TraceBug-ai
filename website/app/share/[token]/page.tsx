import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { createSignedDownloadUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function fetchShare(token: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("sessions")
    .select("title, storage_key, size_bytes, has_video, video_duration_s, screenshot_count, created_at, expires_at, uploaded, deleted_at")
    .eq("share_token", token)
    .single();
  if (!data) return null;
  if (data.deleted_at) return null;
  if (!data.uploaded) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return data;
}

export async function generateMetadata(
  { params }: { params: { token: string } },
): Promise<Metadata> {
  const row = await fetchShare(params.token);
  if (!row) return { title: "Share not found · TraceBug" };
  const title = row.title || "Bug report";
  const desc = `Bug report shared via TraceBug · ${row.screenshot_count} screenshot${row.screenshot_count === 1 ? "" : "s"}${row.has_video && row.video_duration_s ? ` · ${row.video_duration_s}s video` : ""}`;
  return {
    title: `${title} · TraceBug`,
    description: desc,
    openGraph: { title, description: desc, type: "article" },
  };
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const row = await fetchShare(params.token);
  if (!row) notFound();

  const admin = createSupabaseAdminClient();

  // Best-effort: the `priority` column may not exist yet (0006 migration
  // pending). A failed/empty select just leaves the badge off — never 404s.
  let priority: "high" | "medium" | "low" | null = null;
  {
    const { data: p } = await admin
      .from("sessions")
      .select("priority")
      .eq("share_token", params.token)
      .maybeSingle();
    const val = (p as { priority?: string } | null)?.priority;
    if (val === "high" || val === "medium" || val === "low") priority = val;
  }

  let html: string;
  try {
    const signedUrl = await createSignedDownloadUrl(admin, row.storage_key, 300);
    const res = await fetch(signedUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`storage fetch ${res.status}`);
    html = await res.text();
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-surface px-4 py-2 flex items-center justify-between text-xs">
        <span className="text-text-muted">
          Shared via <a href="/" className="text-primary hover:underline">TraceBug</a>
          {row.title && <span className="text-text-primary ml-2">· {row.title}</span>}
          {priority && (
            <span
              className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                priority === "high"
                  ? "bg-red-500/15 text-red-400"
                  : priority === "medium"
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-emerald-500/15 text-emerald-400"
              }`}
            >
              {priority} priority
            </span>
          )}
        </span>
        <span className="text-text-subtle">
          Expires {new Date(row.expires_at).toLocaleDateString()}
        </span>
      </header>
      {/* sandbox: allow-scripts only.
          NEVER add allow-same-origin here — combined with allow-scripts, it
          disables the sandbox entirely, and the embedded report HTML would
          be able to read tracebug.netlify.app's localStorage + cookies (the
          Supabase auth session of whoever is viewing). The replay viewer is
          fully client-side from inlined JSON; it has no need for same-origin
          access. */}
      <iframe
        srcDoc={html}
        sandbox="allow-scripts"
        className="flex-1 w-full border-0"
        title="Bug report"
      />
      <ViewerFooter />
    </main>
  );
}

// Viral footer — every shared link is a lead-gen page for a new user.
// Kept small and informational, not nagging. Loom does the same thing.
function ViewerFooter() {
  return (
    <footer className="border-t border-border bg-surface px-4 py-3 flex flex-wrap items-center justify-center gap-3 text-xs text-text-muted">
      <span>
        Want bug reports like this one?
      </span>
      <a
        href="/"
        className="px-3 py-1.5 rounded-md bg-primary hover:brightness-110 text-white font-medium text-xs transition-colors"
      >
        Get TraceBug — free
      </a>
      <span className="text-text-subtle">·</span>
      <a href="/pricing" className="hover:text-text-primary">Pricing</a>
      <span className="text-text-subtle">·</span>
      <a href="/docs" className="hover:text-text-primary">Docs</a>
      <span className="text-text-subtle">·</span>
      <a
        href="https://github.com/prashantsinghmangat/tracebug-ai"
        target="_blank"
        rel="noreferrer"
        className="hover:text-text-primary"
      >
        GitHub
      </a>
    </footer>
  );
}
