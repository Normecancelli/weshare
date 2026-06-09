import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PUT(
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

  // Verify group exists and belongs to partner
  const { data: group } = await supabase
    .from("order_groups")
    .select("id, stato")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (!group) {
    return NextResponse.json(
      { error: "Gruppo non trovato" },
      { status: 404 }
    );
  }

  // Update group status to confirmed
  const { error: groupError } = await supabase
    .from("order_groups")
    .update({
      stato: "confermato",
      data_caricamento: new Date().toISOString(),
    })
    .eq("id", id);

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  // Mark all group items as confirmed
  await supabase
    .from("group_items")
    .update({ confermato: true })
    .eq("group_id", id);

  // Update all linked orders to "completato"
  const { data: groupOrders } = await supabase
    .from("client_orders")
    .select("id")
    .eq("group_id", id);

  if (groupOrders) {
    await supabase
      .from("client_orders")
      .update({ stato: "completato" })
      .in(
        "id",
        groupOrders.map((o) => o.id)
      );
  }

  return NextResponse.json({
    success: true,
    message: "Gruppo confermato come caricato su Amway",
  });
}
