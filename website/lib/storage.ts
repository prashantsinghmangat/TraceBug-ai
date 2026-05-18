import type { SupabaseClient } from "@supabase/supabase-js";

export const REPORTS_BUCKET = "reports";

// Mint a signed upload URL the client uses to PUT the HTML blob directly into
// Supabase Storage. Caller must already be the authenticated user — RLS on
// storage.objects ensures the path's first segment matches auth.uid().
export async function createSignedUploadUrl(
  supabase: SupabaseClient,
  storageKey: string,
) {
  const { data, error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .createSignedUploadUrl(storageKey);
  if (error) throw error;
  return data; // { signedUrl, path, token }
}

// Mint a short-lived signed download URL for the public viewer page. Called
// server-side with the admin client (service role) because viewers are not
// logged in.
export async function createSignedDownloadUrl(
  supabase: SupabaseClient,
  storageKey: string,
  ttlSeconds = 300,
) {
  const { data, error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .createSignedUrl(storageKey, ttlSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteObject(supabase: SupabaseClient, storageKey: string) {
  const { error } = await supabase.storage.from(REPORTS_BUCKET).remove([storageKey]);
  if (error) throw error;
}

// Object key convention: <user_id>/<session_id>.html
// Storage RLS uses (storage.foldername(name))[1] === auth.uid() to authorize.
export function storageKeyFor(userId: string, sessionId: string): string {
  return `${userId}/${sessionId}.html`;
}
