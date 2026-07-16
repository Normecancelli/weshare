import type { SupabaseClient } from "@supabase/supabase-js";

export const AI_FREE_GENERATIONS_LIMIT = 5;

export function getAiGenerationsRemaining(
  hasPersonalKey: boolean,
  generationsCount: number,
): number | null {
  if (hasPersonalKey) return null;
  return Math.max(0, AI_FREE_GENERATIONS_LIMIT - generationsCount);
}

export async function getAiUsage(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  hasPersonalKey: boolean;
  generationsCount: number;
  anthropicApiKey: string | null;
}> {
  const { data } = await supabase
    .from("profiles")
    .select("anthropic_api_key, ai_generations_count")
    .eq("id", userId)
    .single();

  return {
    hasPersonalKey: !!data?.anthropic_api_key,
    generationsCount: data?.ai_generations_count ?? 0,
    anthropicApiKey: data?.anthropic_api_key ?? null,
  };
}
