import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import AuthClient from "./AuthClient";

export const dynamic = "force-dynamic";

// PHASE2-CLOUD: accounts are not live. A sign-in page on a product whose hero
// says "no account required" reads as a contradiction — 404 until Phase 2 ships.
const PHASE2_CLOUD_LIVE = false;

export default async function AuthPage() {
  if (!PHASE2_CLOUD_LIVE) notFound();
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  return <AuthClient />;
}
