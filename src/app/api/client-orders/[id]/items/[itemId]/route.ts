import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputeOrderTotals } from "@/lib/orders/totals";

async function authorizeOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orderId: string,
) {
  const { data } = await supabase
    .from("client_orders")
    .select("id, stato")
    .eq("id", orderId)
    .eq("partner_id", userId)
    .single();
  return data;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const supabase = await createClient();
  const { id, itemId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const order = await authorizeOrder(supabase, user.id, id);
  if (!order) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }
  if (order.stato !== "bozza") {
    return NextResponse.json(
      { error: "Solo le bozze possono essere modificate" },
      { status: 409 },
    );
  }

  let body: { quantita?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const quantita = Math.floor(body.quantita ?? 0);
  if (quantita < 1) {
    return NextResponse.json(
      { error: "La quantità deve essere almeno 1" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("client_order_items")
    .update({ quantita })
    .eq("id", itemId)
    .eq("order_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recomputeOrderTotals(supabase, id);

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const supabase = await createClient();
  const { id, itemId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const order = await authorizeOrder(supabase, user.id, id);
  if (!order) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }
  if (order.stato !== "bozza") {
    return NextResponse.json(
      { error: "Solo le bozze possono essere modificate" },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("client_order_items")
    .delete()
    .eq("id", itemId)
    .eq("order_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recomputeOrderTotals(supabase, id);

  return NextResponse.json({ success: true });
}
