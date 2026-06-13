import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getSupabaseServiceRoleKey } from "./env";

// Service-role client per operazioni privilegiate (signup, admin tasks).
// MAI esporre questa chiave al client. Usare solo in route handler /api/*.
export function createAdminClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
