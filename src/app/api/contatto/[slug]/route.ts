import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeSlug } from "@/lib/auth/slug";
import { upsertPreviewLink } from "@/lib/prospects/preview-link";

interface ContattoBody {
  nome?: string;
  cognome?: string;
  telefono?: string;
  email?: string;
  website?: string; // honeypot: deve restare vuoto
}

async function findExistingProspectId(
  admin: SupabaseClient,
  partnerId: string,
  telefono: string,
  email: string
): Promise<string | null> {
  if (telefono) {
    const { data } = await admin
      .from("prospects")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("telefono", telefono)
      .maybeSingle();
    if (data) return data.id;
  }
  if (email) {
    const { data } = await admin
      .from("prospects")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("email", email)
      .maybeSingle();
    if (data) return data.id;
  }
  return null;
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

  const { data: partner } = await admin
    .from("profiles")
    .select("id")
    .ilike("invite_url_slug", safeSlug)
    .limit(1)
    .maybeSingle();

  if (!partner) {
    return NextResponse.json({ error: "Link non valido" }, { status: 404 });
  }

  const nomeCompleto = [nome, cognome].filter(Boolean).join(" ");
  const existingId = await findExistingProspectId(admin, partner.id, telefono, email);

  let prospectId: string;

  if (existingId) {
    const { data: updated, error: updErr } = await admin
      .from("prospects")
      .update({
        nome: nomeCompleto,
        telefono: telefono || null,
        email: email || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingId)
      .select("id")
      .single();

    if (updErr || !updated) {
      return NextResponse.json({ error: "Errore durante il salvataggio" }, { status: 500 });
    }
    prospectId = updated.id;
  } else {
    const { data: created, error: insErr } = await admin
      .from("prospects")
      .insert({
        partner_id: partner.id,
        nome: nomeCompleto,
        telefono: telefono || null,
        email: email || null,
        source: "qr_link",
        stato: "nuovo_contatto",
      })
      .select("id")
      .single();

    if (insErr || !created) {
      return NextResponse.json({ error: "Errore durante il salvataggio" }, { status: 500 });
    }
    prospectId = created.id;
  }

  const linkResult = await upsertPreviewLink(admin, prospectId);
  if ("error" in linkResult) {
    return NextResponse.json({ error: linkResult.error }, { status: 500 });
  }

  const origin = request.nextUrl.origin;
  return NextResponse.json({ url: `${origin}/anteprima/${linkResult.token}` });
}
