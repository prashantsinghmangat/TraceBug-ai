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
    <main className="min-h-screen flex flex-col">
      <header className="border-b border-gray-800 bg-gray-950 px-4 py-2 flex items-center justify-between text-xs">
        <span className="text-gray-400">
          Shared via <a href="/" className="text-blue-400 hover:underline">TraceBug</a>
          {row.title && <span className="text-gray-300 ml-2">· {row.title}</span>}
        </span>
        <span className="text-gray-500">
          Expires {new Date(row.expires_at).toLocaleDateString()}
        </span>
      </header>
      <iframe
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin"
        className="flex-1 w-full border-0"
        title="Bug report"
      />
    </main>
  );
}
