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

  // Fetch group
  const { data: group, error } = await supabase
    .from("order_groups")
    .select("*")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (error || !group) {
    return NextResponse.json(
      { error: "Gruppo non trovato" },
      { status: 404 }
    );
  }

  // Fetch group items with order_item + product + customer details
  const { data: groupItems } = await supabase
    .from("group_items")
    .select(
      "*, order_item:client_order_items(*, product:products(id, codice_amway, descrizione, punti_vp, prezzo_cliente, prezzo_partner, provvigione), order:client_orders(customer:customers(id, nome, cognome)))"
    )
    .eq("group_id", id);

  // Calculate VP per cart
  const vpPerCart = { personale: 0, non_registrato: 0, programmato: 0 };
  for (const gi of groupItems || []) {
    const vp =
      (gi.order_item?.punti_vp || 0) * (gi.order_item?.quantita || 1);
    vpPerCart[gi.carrello as keyof typeof vpPerCart] += vp;
  }

  return NextResponse.json({
    group,
    items: groupItems || [],
    vpPerCart: {
      personale: Math.round(vpPerCart.personale * 100) / 100,
      non_registrato: Math.round(vpPerCart.non_registrato * 100) / 100,
      programmato: Math.round(vpPerCart.programmato * 100) / 100,
    },
    vpPersonaleMax: 510,
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

    // Update cart assignments
    if (body.cart_assignments && Array.isArray(body.cart_assignments)) {
      for (const assignment of body.cart_assignments) {
        const { group_item_id, carrello } = assignment;
        if (!group_item_id || !carrello) continue;

        await supabase
          .from("group_items")
          .update({ carrello })
          .eq("id", group_item_id)
          .eq("group_id", id);
      }
    }

    // Update group name/note
    const updates: Record<string, unknown> = {};
    if (body.nome) updates.nome = body.nome;
    if (body.note !== undefined) updates.note = body.note;

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("order_groups")
        .update(updates)
        .eq("id", id)
        .eq("partner_id", user.id);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
