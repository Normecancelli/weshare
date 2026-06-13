// Rimuove caratteri invisibili (U+2028, U+200B, BOM, ecc.) che possono
// finire nelle env vars Supabase tramite copy-paste da dashboard. Se questi
// finiscono in un header HTTP, fetch lancia "Cannot convert argument to a
// ByteString" e ogni richiesta Supabase fallisce.
function sanitizeEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Env mancante: ${name}`);
  }
  const cleaned = value.replace(/[^\x20-\x7E]/g, "").trim();
  if (cleaned !== value) {
    console.warn(
      `[supabase/env] ${name} conteneva caratteri non-ASCII (es. U+2028 da copy-paste) — sanitizzati.`,
    );
  }
  return cleaned;
}

export function getSupabaseUrl(): string {
  return sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseAnonKey(): string {
  return sanitizeEnv(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

export function getSupabaseServiceRoleKey(): string {
  return sanitizeEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
}
