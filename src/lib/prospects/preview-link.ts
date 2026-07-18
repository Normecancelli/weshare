import type { SupabaseClient } from "@supabase/supabase-js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function upsertPreviewLink(
  client: SupabaseClient,
  prospectId: string
): Promise<{ token: string; expiresAt: string } | { error: string }> {
  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS).toISOString();

  const { data, error } = await client
    .from("prospect_preview_links")
    .upsert(
      { prospect_id: prospectId, token, expires_at: expiresAt },
      { onConflict: "prospect_id" }
    )
    .select()
    .single();

  if (error) return { error: error.message };
  return { token: data.token, expiresAt: data.expires_at };
}
