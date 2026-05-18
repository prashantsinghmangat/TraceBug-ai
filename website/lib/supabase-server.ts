import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// User-scoped client. Honors RLS via the authenticated user's session cookie.
// Use this in API routes, Server Components, and Server Actions that act on
// behalf of the signed-in user.
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — Next.js disallows cookie writes
            // here. Middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

// Service-role client. BYPASSES RLS. Only for code paths that legitimately need
// to act outside any single user's scope:
//   - /api/share/[token]   — public viewer fetching another user's row
//   - /api/cron/*          — scheduled cleanup
//   - admin tooling
//
// Never import this into client-side code. The service_role key would grant
// full admin access if exposed.
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
