import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getQuotaSnapshot } from "@/lib/quotas";

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const quotas = await getQuotaSnapshot(supabase, user.id);
  return NextResponse.json({ id: user.id, email: user.email, quotas });
}
