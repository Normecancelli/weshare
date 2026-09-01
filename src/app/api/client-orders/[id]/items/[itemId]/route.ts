import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputeOrderTotals, computeGroupPersonaleVp } from "@/lib/orders/totals";

const EDITABLE_STATES = ["bozza", "in_gruppo"];
const VP_LIMIT_PERSONALE = 510;

async function authorizeOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orderId: string,
) {
  const { data } = await supabase
    .from("client_orders")
    .select("id, stato, group_id")
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
  if (!EDITABLE_STATES.includes(order.stato)) {
    return NextResponse.json(
      { error: "Ordine non modificabile in questo stato" },
      { status: 409 },
    );
  }

  let body: { quantita?: number; fonte?: string; destinazione_uso?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.quantita !== undefined) {
    const quantita = Math.floor(body.quantita);
    if (quantita < 1) {
      return NextResponse.json({ error: "La quantità deve essere almeno 1" }, { status: 400 });
    }
    updates.quantita = quantita;
  }

  if (body.fonte !== undefined || body.destinazione_uso !== undefined) {
    if (order.stato !== "bozza") {
      return NextResponse.json(
        { error: "Fonte/destinazione modificabili solo mentre l'ordine è in bozza" },
        { status: 409 },
      );
    }
    if (body.fonte !== undefined) {
      if (!["amway", "magazzino"].includes(body.fonte)) {
        return NextResponse.json({ error: "Fonte non valida" }, { status: 400 });
      }
      updates.fonte = body.fonte;
    }
    if (body.destinazione_uso !== undefined) {
      if (body.destinazione_uso !== null && !["magazzino", "personale"].includes(body.destinazione_uso)) {
        return NextResponse.json({ error: "Destinazione non valida" }, { status: 400 });
      }
      updates.destinazione_uso = body.destinazione_uso;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 });
  }

  const { error } = await supabase
    .from("client_order_items")
    .update(updates)
    .eq("id", itemId)
    .eq("order_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recomputeOrderTotals(supabase, id);

  let warning: string | null = null;
  if (order.stato === "in_gruppo" && order.group_id) {
    const vpPersonale = await computeGroupPersonaleVp(supabase, order.group_id);
    if (vpPersonale > VP_LIMIT_PERSONALE) {
      warning = `Il carrello "Personale" del gruppo ha superato ${VP_LIMIT_PERSONALE} VP (${vpPersonale.toFixed(2)} VP).`;
    }
  }

  return NextResponse.json({ success: true, warning });
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
  if (!EDITABLE_STATES.includes(order.stato)) {
    return NextResponse.json(
      { error: "Ordine non modificabile in questo stato" },
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
