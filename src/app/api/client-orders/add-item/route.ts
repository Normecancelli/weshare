import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Aggiunge un singolo prodotto a una bozza ordine del cliente.
// Se esiste già una bozza per quel cliente, aggiunge l'item (o incrementa
// la quantità se il prodotto è già presente). Altrimenti crea una nuova
// bozza con quell'unico item. Restituisce sempre order_id e created flag.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  let body: { customer_id?: string; product_id?: string; quantita?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const { customer_id, product_id } = body;
  const quantita = Math.max(1, Math.floor(body.quantita ?? 1));

  if (!customer_id || !product_id) {
    return NextResponse.json(
      { error: "customer_id e product_id sono obbligatori" },
      { status: 400 },
    );
  }

  // Verifica che il cliente sia del partner
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customer_id)
    .eq("partner_id", user.id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });
  }

  // Carica il prodotto
  const { data: product } = await supabase
    .from("products")
    .select(
      "id, prezzo_cliente, prezzo_partner, punti_vp, provvigione",
    )
    .eq("id", product_id)
    .eq("attivo", true)
    .single();

  if (!product) {
    return NextResponse.json(
      { error: "Prodotto non trovato o non attivo" },
      { status: 404 },
    );
  }

  // Cerca una bozza esistente per quel cliente
  const { data: existingDraft } = await supabase
    .from("client_orders")
    .select("id")
    .eq("partner_id", user.id)
    .eq("customer_id", customer_id)
    .eq("stato", "bozza")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let orderId: string;
  let created = false;

  if (existingDraft) {
    orderId = existingDraft.id;

    // Se il prodotto è già nella bozza, incrementa quantità
    const { data: existingItem } = await supabase
      .from("client_order_items")
      .select("id, quantita")
      .eq("order_id", orderId)
      .eq("product_id", product_id)
      .maybeSingle();

    if (existingItem) {
      await supabase
        .from("client_order_items")
        .update({ quantita: existingItem.quantita + quantita })
        .eq("id", existingItem.id);
    } else {
      await supabase.from("client_order_items").insert({
        order_id: orderId,
        product_id,
        quantita,
        prezzo_unitario_cliente: product.prezzo_cliente,
        prezzo_unitario_partner: product.prezzo_partner,
        punti_vp: product.punti_vp,
        provvigione: product.provvigione,
        fonte: "amway",
      });
    }
  } else {
    // Nuova bozza
    const { data: order, error: orderError } = await supabase
      .from("client_orders")
      .insert({
        partner_id: user.id,
        customer_id,
        stato: "bozza",
        totale_cliente: 0,
        totale_partner: 0,
        totale_vp: 0,
        totale_provvigione: 0,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: `Errore creazione bozza: ${orderError?.message}` },
        { status: 500 },
      );
    }
    orderId = order.id;
    created = true;

    const { error: itemErr } = await supabase
      .from("client_order_items")
      .insert({
        order_id: orderId,
        product_id,
        quantita,
        prezzo_unitario_cliente: product.prezzo_cliente,
        prezzo_unitario_partner: product.prezzo_partner,
        punti_vp: product.punti_vp,
        provvigione: product.provvigione,
        fonte: "amway",
      });

    if (itemErr) {
      await supabase.from("client_orders").delete().eq("id", orderId);
      return NextResponse.json(
        { error: `Errore inserimento prodotto: ${itemErr.message}` },
        { status: 500 },
      );
    }
  }

  // Ricalcola i totali della bozza dai suoi item
  const { data: items } = await supabase
    .from("client_order_items")
    .select(
      "quantita, prezzo_unitario_cliente, prezzo_unitario_partner, punti_vp, provvigione",
    )
    .eq("order_id", orderId);

  if (items) {
    const totals = items.reduce(
      (acc, it) => ({
        cliente: acc.cliente + it.prezzo_unitario_cliente * it.quantita,
        partner: acc.partner + it.prezzo_unitario_partner * it.quantita,
        vp: acc.vp + it.punti_vp * it.quantita,
        provv: acc.provv + it.provvigione * it.quantita,
      }),
      { cliente: 0, partner: 0, vp: 0, provv: 0 },
    );

    await supabase
      .from("client_orders")
      .update({
        totale_cliente: Math.round(totals.cliente * 100) / 100,
        totale_partner: Math.round(totals.partner * 100) / 100,
        totale_vp: Math.round(totals.vp * 100) / 100,
        totale_provvigione: Math.round(totals.provv * 100) / 100,
      })
      .eq("id", orderId);
  }

  return NextResponse.json({ order_id: orderId, created });
}
