import { createClient } from "@supabase/supabase-js";

// Service-role client per operazioni privilegiate (signup, admin tasks).
// MAI esporre questa chiave al client. Usare solo in route handler /api/*.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Configurazione mancante: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY non impostate.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
