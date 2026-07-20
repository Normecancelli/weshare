import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeSlug } from "@/lib/auth/slug";
import { upsertPreviewLink } from "@/lib/prospects/preview-link";
import { findOrCreateProspect } from "@/lib/prospects/find-or-create";

interface ContattoBody {
  nome?: string;
  cognome?: string;
  telefono?: string;
  email?: string;
  website?: string; // honeypot: deve restare vuoto
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const safeSlug = sanitizeSlug(slug);
  if (!safeSlug) {
    return NextResponse.json({ error: "Link non valido" }, { status: 400 });
  }

  let body: ContattoBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  if (body.website && body.website.trim()) {
    return NextResponse.json({ url: null });
  }

  const nome = (body.nome || "").trim();
  const cognome = (body.cognome || "").trim();
  const telefono = (body.telefono || "").trim();
  const email = (body.email || "").trim();

  if (!nome || (!telefono && !email)) {
    return NextResponse.json(
      { error: "Nome e almeno un contatto (telefono o email) sono obbligatori" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: partner, error: partnerErr } = await admin
    .from("profiles")
    .select("id")
    .ilike("invite_url_slug", safeSlug)
    .limit(1)
    .maybeSingle();

  if (partnerErr) {
    console.error("[api/contatto] Supabase error (partner lookup)", {
      slug: safeSlug,
      error: partnerErr,
    });
    return NextResponse.json(
      { error: "Errore durante la verifica del link. Riprova tra poco." },
      { status: 500 }
    );
  }
  if (!partner) {
    return NextResponse.json({ error: "Link non valido" }, { status: 404 });
  }

  const nomeCompleto = [nome, cognome].filter(Boolean).join(" ");

  const prospectResult = await findOrCreateProspect(admin, partner.id, {
    nome: nomeCompleto,
    telefono,
    email,
    source: "qr_link",
  });

  if ("error" in prospectResult) {
    console.error("[api/contatto] Supabase error (find-or-create)", {
      slug: safeSlug,
      error: prospectResult.error,
    });
    return NextResponse.json({ error: "Errore durante il salvataggio" }, { status: 500 });
  }

  const linkResult = await upsertPreviewLink(admin, prospectResult.id);
  if ("error" in linkResult) {
    return NextResponse.json({ error: linkResult.error }, { status: 500 });
  }

  const origin = request.nextUrl.origin;
  return NextResponse.json({ url: `${origin}/anteprima/${linkResult.token}` });
}
