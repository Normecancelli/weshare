import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

async function applyStockDelta(
  supabase: SupabaseClient,
  partnerId: string,
  productId: string,
  delta: number,
) {
  const { data: existing } = await supabase
    .from("magazzino_items")
    .select("id, quantita")
    .eq("partner_id", partnerId)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("magazzino_items")
      .update({ quantita: Math.max(0, existing.quantita + delta) })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("magazzino_items")
      .insert({ partner_id: partnerId, product_id: productId, quantita: Math.max(0, delta) });
  }
}

// Muove magazzino_items per gli item di un ordine non ancora movimentati.
// direction: "confirm" (prima conferma: incrementa per destinazione_uso
// magazzino, decrementa per fonte magazzino) o "rollback" (annulla il
// movimento fatto in precedenza, verso natura opposta). Su "confirm" valida
// TUTTI gli item prima di scrivere qualunque cosa, per evitare scritture
// parziali se un item successivo blocca la conferma.
async function movimentaStock(
  supabase: SupabaseClient,
  partnerId: string,
  orderId: string,
  direction: "confirm" | "rollback",
): Promise<string | null> {
  const { data: allItems } = await supabase
    .from("client_order_items")
    .select("id, product_id, quantita, fonte, destinazione_uso, magazzino_movimentato")
    .eq("order_id", orderId);

  if (!allItems || allItems.length === 0) return null;

  const pending = allItems.filter((item) => {
    const isCarico = item.destinazione_uso === "magazzino";
    const isScarico = item.fonte === "magazzino";
    if (!isCarico && !isScarico) return false;
    return direction === "confirm" ? !item.magazzino_movimentato : item.magazzino_movimentato;
  });

  if (pending.length === 0) return null;

  if (direction === "confirm") {
    const scaricoTotals = new Map<string, number>();
    for (const item of pending) {
      if (item.fonte === "magazzino") {
        scaricoTotals.set(item.product_id, (scaricoTotals.get(item.product_id) || 0) + item.quantita);
      }
    }
    for (const [productId, needed] of scaricoTotals) {
      const { data: current } = await supabase
        .from("magazzino_items")
        .select("quantita")
        .eq("partner_id", partnerId)
        .eq("product_id", productId)
        .maybeSingle();
      if (!current || current.quantita < needed) {
        return `Stock insufficiente per un prodotto dell'ordine (disponibili: ${current?.quantita ?? 0}, richiesti: ${needed})`;
      }
    }

    for (const item of pending) {
      const isCarico = item.destinazione_uso === "magazzino";
      const delta = isCarico ? item.quantita : -item.quantita;
      await applyStockDelta(supabase, partnerId, item.product_id, delta);
      await supabase
        .from("client_order_items")
        .update({ magazzino_movimentato: true })
        .eq("id", item.id);
    }
  } else {
    for (const item of pending) {
      const isCarico = item.destinazione_uso === "magazzino";
      const delta = isCarico ? -item.quantita : item.quantita;
      await applyStockDelta(supabase, partnerId, item.product_id, delta);
      await supabase
        .from("client_order_items")
        .update({ magazzino_movimentato: false })
        .eq("id", item.id);
    }
  }

  return null;
}

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
      "*, customer:customers(id, nome, cognome, telefono, email), receipt_log:receipt_email_log(id, order_id, to_email, sent_at)"
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

    // Prima conferma: assegna il prossimo numero ricevuta progressivo per
    // l'anno corrente. Se l'ordine ha già un numero (riconfermato dopo
    // "Riporta a bozza"), non ne consuma uno nuovo.
    if (stato === "confermato") {
      const { data: current } = await supabase
        .from("client_orders")
        .select("numero_ricevuta")
        .eq("id", id)
        .eq("partner_id", user.id)
        .single();

      if (current && !current.numero_ricevuta) {
        const { data: numero, error: numeroError } = await supabase.rpc(
          "next_receipt_number",
          { p_anno: new Date().getFullYear() }
        );
        if (numeroError) {
          return NextResponse.json({ error: numeroError.message }, { status: 500 });
        }
        updates.numero_ricevuta = numero;
      }
    }

    if (stato === "confermato") {
      const stockError = await movimentaStock(supabase, user.id, id, "confirm");
      if (stockError) {
        return NextResponse.json({ error: stockError }, { status: 409 });
      }
    }

    if (stato === "bozza" || stato === "annullato") {
      await movimentaStock(supabase, user.id, id, "rollback");
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

  const { data: order } = await supabase
    .from("client_orders")
    .select("id, stato")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  if (order.stato !== "bozza" && order.stato !== "annullato") {
    return NextResponse.json(
      { error: "Solo le bozze o gli ordini annullati possono essere eliminati" },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("client_orders")
    .delete()
    .eq("id", id)
    .eq("partner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
