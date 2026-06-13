import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeSlug } from "@/lib/auth/slug";

// GET pubblico: ritorna info minime dello sponsor identificato dallo slug.
// Usato dalla landing /invite/[slug] per mostrare "stai per iscriverti con X".
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const safeSlug = sanitizeSlug(slug);
  if (!safeSlug) {
    return NextResponse.json({ error: "Slug mancante o non valido" }, { status: 400 });
  }

  const supabase = createAdminClient();
  // Match case-insensitive su invite_url_slug. Se più di un profilo matcha
  // (improbabile), prendiamo il primo per evitare 500.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, codice_amway, nome, qualifica, invite_url_slug")
    .ilike("invite_url_slug", safeSlug)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[api/sponsor] Supabase error", { slug: safeSlug, error });
    return NextResponse.json(
      { error: "Errore caricamento sponsor. Riprova tra poco." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "Sponsor non trovato. Verifica che il link sia corretto." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    sponsor: {
      id: data.id,
      codice_amway: data.codice_amway,
      nome: data.nome,
      qualifica: data.qualifica,
      slug: data.invite_url_slug,
    },
  });
}
