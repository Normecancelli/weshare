import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const FLAGS = ["da_valutare", "inviare", "non_inviare", "sospeso"];

export async function PATCH(
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
    const { follow_up_flag } = body;

    if (!FLAGS.includes(follow_up_flag)) {
      return NextResponse.json({ error: "Flag non valido" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("prospects")
      .update({ follow_up_flag, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("partner_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ prospect: data });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
