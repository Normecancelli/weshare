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
  const upperSlug = safeSlug.toUpperCase();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, codice_amway, nome, qualifica, invite_url_slug")
    .or(`invite_url_slug.eq.${upperSlug},invite_url_slug.eq.${safeSlug}`)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Sponsor non trovato" },
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
