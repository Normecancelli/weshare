import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function ownsProspect(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prospectId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("prospects")
    .select("id")
    .eq("id", prospectId)
    .eq("partner_id", userId)
    .single();
  return !!data;
}

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

  const { data, error } = await supabase
    .from("prospect_appointments")
    .select("*")
    .eq("prospect_id", id)
    .eq("partner_id", user.id)
    .order("data_ora", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appointments: data || [] });
}

export async function POST(
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

  if (!(await ownsProspect(supabase, id, user.id))) {
    return NextResponse.json({ error: "Contatto non trovato" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { titolo, data_ora, durata_min, location, note } = body;

    if (!data_ora) {
      return NextResponse.json(
        { error: "Data e ora sono obbligatorie" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("prospect_appointments")
      .insert({
        prospect_id: id,
        partner_id: user.id,
        titolo: titolo?.trim() || "Appuntamento",
        data_ora,
        durata_min: typeof durata_min === "number" ? durata_min : 60,
        location: location?.trim() || null,
        note: note?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ appointment: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
