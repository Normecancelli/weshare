import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
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

  const { data, error } = await supabase
    .from("prospect_messages")
    .select("*")
    .eq("prospect_id", id)
    .eq("partner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: data || [] });
}

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

  // Verify ownership + read cadence in one fetch
  const { data: prospect } = await supabase
    .from("prospects")
    .select("id, cadenza_giorni")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (!prospect) {
    return NextResponse.json({ error: "Contatto non trovato" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { tipo, template_id } = body;

    if (tipo !== "email" && tipo !== "whatsapp") {
      return NextResponse.json({ error: "Tipo non valido" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("prospect_messages")
      .insert({
        prospect_id: id,
        partner_id: user.id,
        tipo,
        template_id: template_id || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Advance the next reminder by the cadence
    const next = new Date();
    next.setDate(next.getDate() + (prospect.cadenza_giorni || 14));
    await supabase
      .from("prospects")
      .update({ prossima_data_reminder: next.toISOString().slice(0, 10) })
      .eq("id", id)
      .eq("partner_id", user.id);

    return NextResponse.json({ message: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
