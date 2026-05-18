import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

// Server side: only enforce auth + pass identity to the client. Data fetch
// happens on the client via /api/sessions and /api/me — those endpoints are
// known to work, and using them avoids any Server Component caching surprises.
export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  return (
    <DashboardClient
      email={user.email ?? ""}
      siteUrl={siteUrl}
    />
  );
}
