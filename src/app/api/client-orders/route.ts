import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFiscalYearBounds } from "@/lib/orders/fiscal-year";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const stato = request.nextUrl.searchParams.get("stato") || "";
  const customerId = request.nextUrl.searchParams.get("customer_id") || "";

  let query = supabase
    .from("client_orders")
    .select(
      "*, customer:customers(id, nome, cognome, telefono), items:client_order_items(id, quantita, product:products(descrizione, codice_amway))"
    )
    .eq("partner_id", user.id)
    .order("created_at", { ascending: false });

  if (stato) {
    query = query.eq("stato", stato);
  }

  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Stats
  const all = data || [];

  // "Da raggruppare" e "completati" restano su tutti gli ordini (coda di
  // lavoro corrente, non uno storico): un ordine confermato ma non ancora
  // raggruppato va gestito indipendentemente da quando è stato creato.
  const daRaggruppare = all.filter(
    (o) => o.stato === "confermato"
  ).length;
  const completati = all.filter(
    (o) => o.stato === "completato"
  ).length;

  // Ordini totali / VP / Provvigioni: filtrati sull'anno fiscale Amway
  // corrente, per coerenza con le card "Ordini anno fiscale Amway" sopra
  // (altrimenti le due righe di statistiche raccontano periodi diversi).
  const { start: fyStart, end: fyEnd } = getFiscalYearBounds(new Date());
  const inFiscalYear = all.filter((o) => {
    const d = new Date(o.created_at);
    return d >= fyStart && d <= fyEnd;
  });

  const totaleVp = inFiscalYear
    .filter((o) => o.stato !== "annullato")
    .reduce((sum, o) => sum + (o.totale_vp || 0), 0);
  const totaleProvvigione = inFiscalYear
    .filter((o) => o.stato !== "annullato")
    .reduce((sum, o) => sum + (o.totale_provvigione || 0), 0);

  return NextResponse.json({
    orders: all,
    stats: {
      totale: inFiscalYear.length,
      daRaggruppare,
      completati,
      totaleVp: Math.round(totaleVp * 100) / 100,
      totaleProvvigione: Math.round(totaleProvvigione * 100) / 100,
    },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { customer_id, canale, note, items } = body;

    if (!customer_id) {
      return NextResponse.json(
        { error: "Cliente obbligatorio" },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Almeno un prodotto richiesto" },
        { status: 400 }
      );
    }

    // Verify customer belongs to this partner
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("id", customer_id)
      .eq("partner_id", user.id)
      .single();

    if (!customer) {
      return NextResponse.json(
        { error: "Cliente non trovato" },
        { status: 404 }
      );
    }

    // Calculate totals from items
    let totaleCliente = 0;
    let totalePartner = 0;
    let totaleVp = 0;
    let totaleProvvigione = 0;

    // Fetch product details for all items
    const productIds = items.map((i: { product_id: string }) => i.product_id);
    const { data: products } = await supabase
      .from("products")
      .select("*")
      .in("id", productIds);

    if (!products || products.length !== productIds.length) {
      return NextResponse.json(
        { error: "Uno o più prodotti non trovati" },
        { status: 400 }
      );
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    const orderItems = items.map(
      (item: { product_id: string; quantita: number; note?: string; fonte?: "amway" | "magazzino"; destinazione_uso?: "magazzino" | "personale" }) => {
        const product = productMap.get(item.product_id)!;
        const qty = item.quantita || 1;

        totaleCliente += product.prezzo_cliente * qty;
        totalePartner += product.prezzo_partner * qty;
        totaleVp += product.punti_vp * qty;
        totaleProvvigione += product.provvigione * qty;

        return {
          product_id: item.product_id,
          quantita: qty,
          prezzo_unitario_cliente: product.prezzo_cliente,
          prezzo_unitario_partner: product.prezzo_partner,
          punti_vp: product.punti_vp,
          provvigione: product.provvigione,
          fonte: item.fonte || "amway",
          destinazione_uso: item.destinazione_uso || null,
          note: item.note || null,
        };
      }
    );

    // Create the order
    const { data: order, error: orderError } = await supabase
      .from("client_orders")
      .insert({
        partner_id: user.id,
        customer_id,
        stato: "bozza",
        canale: canale || null,
        note: note || null,
        totale_cliente: Math.round(totaleCliente * 100) / 100,
        totale_partner: Math.round(totalePartner * 100) / 100,
        totale_vp: Math.round(totaleVp * 100) / 100,
        totale_provvigione: Math.round(totaleProvvigione * 100) / 100,
      })
      .select()
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: `Errore creazione ordine: ${orderError?.message}` },
        { status: 500 }
      );
    }

    // Insert order items
    const itemsWithOrderId = orderItems.map((item) => ({
      ...item,
      order_id: order.id,
    }));

    const { error: itemsError } = await supabase
      .from("client_order_items")
      .insert(itemsWithOrderId);

    if (itemsError) {
      // Rollback: delete the order
      await supabase.from("client_orders").delete().eq("id", order.id);
      return NextResponse.json(
        { error: `Errore inserimento prodotti: ${itemsError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
