// Rimuove caratteri invisibili (U+2028, U+200B, BOM, ecc.) che possono
// finire nelle env vars Supabase tramite copy-paste da dashboard. Se questi
// finiscono in un header HTTP, fetch lancia "Cannot convert argument to a
// ByteString" e ogni richiesta Supabase fallisce.
const logged = new Set<string>();
function sanitizeEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Env mancante: ${name}`);
  }
  const cleaned = value.replace(/[^\x20-\x7E]/g, "").trim();
  // Log diagnostico al primo uso per ogni nome (uno solo per cold start).
  if (!logged.has(name)) {
    logged.add(name);
    const dirty = value.length !== cleaned.length;
    const badAt: number[] = [];
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c < 0x20 || c > 0x7E) badAt.push(i);
    }
    console.log(
      `[supabase/env] ${name}: raw_len=${value.length} clean_len=${cleaned.length} dirty=${dirty} bad_indices=${JSON.stringify(badAt.slice(0, 10))}`,
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
