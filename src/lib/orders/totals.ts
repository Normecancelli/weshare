import type { SupabaseClient } from "@supabase/supabase-js";

// Ricalcola i totali di una bozza/ordine sommando i suoi item e
// scrive il risultato in client_orders. Da chiamare dopo ogni
// inserimento/aggiornamento/cancellazione di item.
export async function recomputeOrderTotals(
  supabase: SupabaseClient,
  orderId: string,
) {
  const { data: items } = await supabase
    .from("client_order_items")
    .select(
      "quantita, prezzo_unitario_cliente, prezzo_unitario_partner, punti_vp, provvigione",
    )
    .eq("order_id", orderId);

  const totals = (items || []).reduce(
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

// Somma i VP del carrello "personale" di un gruppo. Usato per avvisare
// (non bloccare) quando un'aggiunta post-raggruppamento sfora i 510 VP.
export async function computeGroupPersonaleVp(
  supabase: SupabaseClient,
  groupId: string,
) {
  const { data } = await supabase
    .from("group_items")
    .select("order_item:client_order_items(quantita, punti_vp)")
    .eq("group_id", groupId)
    .eq("carrello", "personale")
    .returns<{ order_item: { quantita: number; punti_vp: number } | null }[]>();

  return (data || []).reduce(
    (sum, gi) => sum + (gi.order_item?.punti_vp || 0) * (gi.order_item?.quantita || 0),
    0,
  );
}
