import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Cerca profili con qualifica platino o superiore (smeraldo / diamante),
// oppure solo diamante se ?solo=diamante è passato (usato dall'autocomplete
// "Diamante di riferimento" in Impostazioni).
// Pubblico — usato anche nel form di registrazione. Ritorna SOLO campi
// sicuri (id, nome, codice, qualifica). No email, no telefono.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const solo = request.nextUrl.searchParams.get("solo");
  const supabase = createAdminClient();

  const qualifiche = solo === "diamante" ? ["diamante"] : ["platino", "smeraldo", "diamante"];

  let query = supabase
    .from("profiles")
    .select("id, codice_amway, nome, qualifica")
    .in("qualifica", qualifiche)
    .order("nome")
    .limit(20);

  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    const pattern = `%${tokens.join("%")}%`;
    query = query.or(
      `nome.ilike.${pattern},codice_amway.ilike.${pattern}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ platini: data || [] });
}
