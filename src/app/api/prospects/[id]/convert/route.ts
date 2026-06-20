import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // Load prospect (ownership) and guard against double conversion
  const { data: prospect } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (!prospect) {
    return NextResponse.json({ error: "Contatto non trovato" }, { status: 404 });
  }
  if (prospect.convertito_a) {
    return NextResponse.json(
      { error: "Questo contatto è già stato convertito" },
      { status: 409 }
    );
  }

  let body: { convertTo?: string; customerData?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (body.convertTo === "cliente") {
    const c = body.customerData || {};
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .insert({
        partner_id: user.id,
        nome: (c.nome || prospect.nome).trim(),
        cognome: c.cognome?.trim() || null,
        telefono: c.telefono?.trim() || prospect.telefono || null,
        email: c.email?.trim() || prospect.email || null,
        indirizzo: c.indirizzo?.trim() || null,
        citta: c.citta?.trim() || prospect.citta || null,
        note: c.note?.trim() || prospect.note || null,
      })
      .select()
      .single();

    if (custErr) {
      return NextResponse.json({ error: custErr.message }, { status: 500 });
    }

    const { data: updated, error: updErr } = await supabase
      .from("prospects")
      .update({
        stato: "convertito_cliente",
        convertito_a: "cliente",
        customer_id: customer.id,
        data_conversione: now,
        updated_at: now,
      })
      .eq("id", id)
      .eq("partner_id", user.id)
      .select()
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ prospect: updated, customer }, { status: 201 });
  }

  if (body.convertTo === "partner") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("invite_url_slug, codice_amway")
      .eq("id", user.id)
      .single();

    const inviteSlug = profile?.invite_url_slug || profile?.codice_amway || null;

    const { data: updated, error: updErr } = await supabase
      .from("prospects")
      .update({
        stato: "convertito_partner",
        convertito_a: "partner",
        data_conversione: now,
        updated_at: now,
      })
      .eq("id", id)
      .eq("partner_id", user.id)
      .select()
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ prospect: updated, inviteSlug });
  }

  return NextResponse.json(
    { error: "convertTo deve essere 'cliente' o 'partner'" },
    { status: 400 }
  );
}
