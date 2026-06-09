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
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Cliente non trovato" },
      { status: 404 }
    );
  }

  return NextResponse.json({ customer: data });
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
    const updates: Record<string, unknown> = {};

    for (const field of [
      "nome",
      "cognome",
      "telefono",
      "email",
      "codice_attivita",
      "diamante_riferimento",
      "indirizzo",
      "citta",
      "note",
    ]) {
      if (field in body) {
        updates[field] =
          body[field] && typeof body[field] === "string"
            ? body[field].trim()
            : body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Nessun campo da aggiornare" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("customers")
      .update(updates)
      .eq("id", id)
      .eq("partner_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ customer: data });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}

export async function DELETE(
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

  // Check if customer has orders before deleting
  const { data: orders } = await supabase
    .from("client_orders")
    .select("id")
    .eq("customer_id", id)
    .limit(1);

  if (orders && orders.length > 0) {
    return NextResponse.json(
      {
        error:
          "Impossibile eliminare un cliente con ordini. Puoi modificare i suoi dati.",
      },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("partner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
