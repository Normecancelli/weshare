import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputeOrderTotals, computeGroupPersonaleVp } from "@/lib/orders/totals";

const VP_LIMIT_PERSONALE = 510;

// Aggiunge un prodotto a un ordine esistente e specifico (bozza o già
// raggruppato). A differenza di /api/client-orders/add-item (che cerca
// l'ultima bozza del cliente), qui l'ordine è quello indicato dall'URL:
// serve per far modificare un ordine dalla sua pagina di dettaglio anche
// dopo che è stato messo in un gruppo (il cliente aggiunge qualcosa
// all'ultimo momento prima del caricamento su Amway).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
    .select("id, stato, group_id")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }
  if (order.stato !== "bozza" && order.stato !== "in_gruppo") {
    return NextResponse.json(
      { error: "Ordine non modificabile in questo stato" },
      { status: 409 },
    );
  }

  let body: { product_id?: string; quantita?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const { product_id } = body;
  const quantita = Math.max(1, Math.floor(body.quantita ?? 1));
  if (!product_id) {
    return NextResponse.json(
      { error: "product_id obbligatorio" },
      { status: 400 },
    );
  }

  const { data: product } = await supabase
    .from("products")
    .select("id, prezzo_cliente, prezzo_partner, punti_vp, provvigione")
    .eq("id", product_id)
    .eq("attivo", true)
    .single();

  if (!product) {
    return NextResponse.json(
      { error: "Prodotto non trovato o non attivo" },
      { status: 404 },
    );
  }

  const { data: existingItem } = await supabase
    .from("client_order_items")
    .select("id, quantita")
    .eq("order_id", id)
    .eq("product_id", product_id)
    .maybeSingle();

  let itemId: string;

  if (existingItem) {
    itemId = existingItem.id;
    await supabase
      .from("client_order_items")
      .update({ quantita: existingItem.quantita + quantita })
      .eq("id", itemId);
  } else {
    const { data: newItem, error: itemErr } = await supabase
      .from("client_order_items")
      .insert({
        order_id: id,
        product_id,
        quantita,
        prezzo_unitario_cliente: product.prezzo_cliente,
        prezzo_unitario_partner: product.prezzo_partner,
        punti_vp: product.punti_vp,
        provvigione: product.provvigione,
        fonte: "amway",
      })
      .select("id")
      .single();

    if (itemErr || !newItem) {
      return NextResponse.json(
        { error: `Errore inserimento prodotto: ${itemErr?.message}` },
        { status: 500 },
      );
    }
    itemId = newItem.id;

    // L'ordine è già raggruppato: aggancia subito il nuovo articolo al
    // gruppo (nel carrello "personale" di default) così non resta invisibile.
    if (order.stato === "in_gruppo" && order.group_id) {
      await supabase.from("group_items").insert({
        group_id: order.group_id,
        order_item_id: itemId,
        carrello: "personale",
        confermato: false,
      });
    }
  }

  await recomputeOrderTotals(supabase, id);

  let warning: string | null = null;
  if (order.stato === "in_gruppo" && order.group_id) {
    const vpPersonale = await computeGroupPersonaleVp(supabase, order.group_id);
    if (vpPersonale > VP_LIMIT_PERSONALE) {
      warning = `Il carrello "Personale" del gruppo ha superato ${VP_LIMIT_PERSONALE} VP (${vpPersonale.toFixed(2)} VP).`;
    }
  }

  return NextResponse.json({ success: true, item_id: itemId, warning });
}
