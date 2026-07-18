import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiUsage, getAiGenerationsRemaining } from "@/lib/auth/ai-limit";

const PROFILE_FIELDS =
  "id, nome, email, telefono, indirizzo, cap, citta, codice_amway, codice_attivita, qualifica, data_ingresso, platino_riferimento_id, diamante_riferimento_id, preferenze_notifiche, avatar_url, invite_url_slug";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Profilo non trovato" }, { status: 404 });
  }

  const { hasPersonalKey, generationsCount } = await getAiUsage(admin, user.id);

  return NextResponse.json({
    profile,
    hasAnthropicKey: hasPersonalKey,
    aiGenerationsRemaining: getAiGenerationsRemaining(hasPersonalKey, generationsCount),
  });
}

interface PatchBody {
  nome?: string;
  telefono?: string | null;
  indirizzo?: string | null;
  cap?: string | null;
  citta?: string | null;
  codice_attivita?: string | null;
  qualifica?: string | null;
  data_ingresso?: string | null;
  platino_riferimento_id?: string | null;
  diamante_riferimento_id?: string | null;
  preferenze_notifiche?: Record<string, boolean>;
  anthropic_api_key?: string | null;
}

const PATCHABLE_KEYS: (keyof PatchBody)[] = [
  "nome",
  "telefono",
  "indirizzo",
  "cap",
  "citta",
  "codice_attivita",
  "qualifica",
  "data_ingresso",
  "platino_riferimento_id",
  "diamante_riferimento_id",
  "preferenze_notifiche",
  "anthropic_api_key",
];

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const key of PATCHABLE_KEYS) {
    if (key in body) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 });
  }

  if ("anthropic_api_key" in update && typeof update.anthropic_api_key === "string" && !update.anthropic_api_key.trim()) {
    update.anthropic_api_key = null;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update(update).eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
