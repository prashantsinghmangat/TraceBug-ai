// POST /api/ai/diagnose
// Body: { prompt: string }  — the bug-report prompt built by the SDK
//        (src/exporters/ai-prompt.ts), already redacted client-side.
// Returns: { diagnosis, usage, model }
//
// Requires an authenticated Supabase user. Enforces a per-user monthly free-tier
// cap and a coarse per-minute burst guard server-side (the client display is
// informational only). Each successful analysis is recorded in ai_analyses.

import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  diagnoseBug,
  AiNotConfiguredError,
  AiRefusalError,
} from "@/lib/anthropic";
import { AI_ANALYSES_FREE_PER_MONTH, AI_RATE_LIMIT_PER_MINUTE } from "@/lib/quotas";

// The Anthropic SDK needs the Node runtime (not edge).
export const runtime = "nodejs";

const BodySchema = z.object({
  // Lower bound rejects empty/garbage; upper bound caps cost and matches the
  // SDK's ~2–8K-char prompt budget with generous headroom.
  prompt: z.string().min(20).max(60_000),
});

function startOfMonthUtcISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // ── Validate body ──────────────────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // ── Burst guard: count this user's analyses in the last 60s ─────────────────
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count: recent, error: recentErr } = await supabase
    .from("ai_analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if (recentErr) {
    return NextResponse.json({ error: "db_error", detail: recentErr.message }, { status: 500 });
  }
  if ((recent ?? 0) >= AI_RATE_LIMIT_PER_MINUTE) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: 60 },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // ── Monthly free-tier cap ────────────────────────────────────────────────────
  const { count: monthCount, error: monthErr } = await supabase
    .from("ai_analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", startOfMonthUtcISO());
  if (monthErr) {
    return NextResponse.json({ error: "db_error", detail: monthErr.message }, { status: 500 });
  }
  if ((monthCount ?? 0) >= AI_ANALYSES_FREE_PER_MONTH) {
    return NextResponse.json(
      {
        error: "quota_exceeded",
        limit: AI_ANALYSES_FREE_PER_MONTH,
        used: monthCount ?? 0,
        period: "month",
      },
      { status: 402 },
    );
  }

  // ── Run the diagnosis ────────────────────────────────────────────────────────
  let result;
  try {
    result = await diagnoseBug(parsed.data.prompt);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: "ai_disabled" }, { status: 503 });
    }
    if (err instanceof AiRefusalError) {
      return NextResponse.json({ error: "refused" }, { status: 422 });
    }
    const detail = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "ai_error", detail }, { status: 502 });
  }

  // ── Record usage (consumes quota only on success) ────────────────────────────
  // RLS allows a user to insert their own rows. Best-effort: don't fail the
  // response if the insert hiccups, but log it.
  const { error: insertErr } = await supabase.from("ai_analyses").insert({
    user_id: user.id,
    model: result.model,
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
  });
  if (insertErr) {
    console.error("[ai/diagnose] failed to record usage:", insertErr.message);
  }

  return NextResponse.json({
    diagnosis: result.diagnosis,
    usage: result.usage,
    model: result.model,
    quota: { limit: AI_ANALYSES_FREE_PER_MONTH, used: (monthCount ?? 0) + 1, period: "month" },
  });
}
