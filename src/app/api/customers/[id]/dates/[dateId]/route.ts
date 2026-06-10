import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; dateId: string }> }
) {
  const supabase = await createClient();
  const { id, dateId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });
  }

  const { error } = await supabase
    .from("customer_dates")
    .delete()
    .eq("id", dateId)
    .eq("customer_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
