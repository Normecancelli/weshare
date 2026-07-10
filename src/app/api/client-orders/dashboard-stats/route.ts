import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Anno fiscale Amway: 1 settembre - 31 agosto.
function getFiscalYearBounds(date: Date) {
  const month = date.getMonth(); // 0-indexed, 8 = settembre
  const startYear = month >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return {
    start: new Date(startYear, 8, 1, 0, 0, 0),
    end: new Date(startYear + 1, 7, 31, 23, 59, 59, 999),
    startYear,
  };
}

interface ItemWithGroup {
  order_id: string;
  group_item: { carrello: string } | { carrello: string }[] | null;
}

function extractCarrello(gi: ItemWithGroup["group_item"]): string | undefined {
  if (!gi) return undefined;
  return Array.isArray(gi) ? gi[0]?.carrello : gi.carrello;
}

// Conta gli ordini clienti già inviati su Amway (stato "completato"),
// suddivisi per anno fiscale/mese corrente e per carrello di
// destinazione (personale/non_registrato/programmato). Il conteggio
// "programmato" è cumulativo (da sempre), non limitato all'anno
// fiscale: alimenta l'avviso "ogni 3 ordini programmati" per lo sconto
// extra del 15% su prodotti selezionati (applicazione dello sconto
// resta manuale su Amway, qui è solo un promemoria).
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const now = new Date();
  const { start: fyStart, end: fyEnd, startYear } = getFiscalYearBounds(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const { data: completedOrders } = await supabase
    .from("client_orders")
    .select("id, updated_at")
    .eq("partner_id", user.id)
    .eq("stato", "completato");

  const orders = completedOrders || [];

  const totaleAnnoFiscale = orders.filter((o) => {
    const d = new Date(o.updated_at);
    return d >= fyStart && d <= fyEnd;
  }).length;

  const totaleMese = orders.filter((o) => {
    const d = new Date(o.updated_at);
    return d >= monthStart && d <= monthEnd;
  }).length;

  const cartCounts = { personale: 0, non_registrato: 0, programmato: 0 };
  const orderIds = orders.map((o) => o.id);

  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from("client_order_items")
      .select("order_id, group_item:group_items(carrello)")
      .in("order_id", orderIds)
      .returns<ItemWithGroup[]>();

    const orderCarts = new Map<string, Set<string>>();
    for (const it of items || []) {
      const carrello = extractCarrello(it.group_item);
      if (!carrello) continue;
      if (!orderCarts.has(it.order_id)) orderCarts.set(it.order_id, new Set());
      orderCarts.get(it.order_id)!.add(carrello);
    }

    for (const carts of orderCarts.values()) {
      if (carts.has("personale")) cartCounts.personale++;
      if (carts.has("non_registrato")) cartCounts.non_registrato++;
      if (carts.has("programmato")) cartCounts.programmato++;
    }
  }

  const twoDigit = (y: number) => String(y).slice(-2);

  return NextResponse.json({
    totaleAnnoFiscale,
    totaleMese,
    cartCounts,
    fiscalYearLabel: `01.09.${twoDigit(startYear)} - 31.08.${twoDigit(startYear + 1)}`,
  });
}
