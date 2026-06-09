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

  const { data: order, error } = await supabase
    .from("client_orders")
    .select(
      "*, customer:customers(id, nome, cognome, telefono, email)"
    )
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (error || !order) {
    return NextResponse.json(
      { error: "Ordine non trovato" },
      { status: 404 }
    );
  }

  // Fetch items with product details
  const { data: items } = await supabase
    .from("client_order_items")
    .select(
      "*, product:products(id, codice_amway, descrizione, contenuto, categoria)"
    )
    .eq("order_id", id);

  return NextResponse.json({
    order: { ...order, items: items || [] },
  });
}

export async function PUT(
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

  try {
    const body = await request.json();
    const { stato, canale, note } = body;

    const updates: Record<string, unknown> = {};
    if (stato) updates.stato = stato;
    if (canale !== undefined) updates.canale = canale;
    if (note !== undefined) updates.note = note;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Nessun campo da aggiornare" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("client_orders")
      .update(updates)
      .eq("id", id)
      .eq("partner_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ order: data });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
