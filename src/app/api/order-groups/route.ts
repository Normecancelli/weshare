import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const stato = request.nextUrl.searchParams.get("stato") || "";

  let query = supabase
    .from("order_groups")
    .select("*")
    .eq("partner_id", user.id)
    .order("created_at", { ascending: false });

  if (stato) {
    query = query.eq("stato", stato);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ groups: data || [] });
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
    const { nome, order_ids } = body;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return NextResponse.json(
        { error: "Seleziona almeno un ordine" },
        { status: 400 }
      );
    }

    // Verify all orders belong to this partner and are in "confermato" status
    const { data: orders } = await supabase
      .from("client_orders")
      .select("id, stato")
      .in("id", order_ids)
      .eq("partner_id", user.id);

    if (!orders || orders.length !== order_ids.length) {
      return NextResponse.json(
        { error: "Uno o più ordini non trovati" },
        { status: 400 }
      );
    }

    const nonConfermati = orders.filter((o) => o.stato !== "confermato");
    if (nonConfermati.length > 0) {
      return NextResponse.json(
        {
          error: `${nonConfermati.length} ordini non sono in stato "confermato". Conferma prima gli ordini.`,
        },
        { status: 400 }
      );
    }

    // Create the group
    const groupName =
      nome ||
      `Gruppo ${new Date().toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
      })}`;

    const { data: group, error: groupError } = await supabase
      .from("order_groups")
      .insert({
        partner_id: user.id,
        nome: groupName,
        stato: "aperto",
      })
      .select()
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { error: `Errore creazione gruppo: ${groupError?.message}` },
        { status: 500 }
      );
    }

    // Update orders to link to group
    await supabase
      .from("client_orders")
      .update({ stato: "in_gruppo", group_id: group.id })
      .in("id", order_ids)
      .eq("partner_id", user.id);

    // Fetch all items from these orders and create group_items
    // (esclude le righe soddisfatte da Stock: non vanno riordinate ad Amway)
    const { data: allItems } = await supabase
      .from("client_order_items")
      .select("id")
      .in("order_id", order_ids)
      .neq("fonte", "magazzino");

    if (allItems && allItems.length > 0) {
      const groupItems = allItems.map((item) => ({
        group_id: group.id,
        order_item_id: item.id,
        carrello: "personale" as const,
        confermato: false,
      }));

      await supabase.from("group_items").insert(groupItems);
    }

    return NextResponse.json({ group }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
