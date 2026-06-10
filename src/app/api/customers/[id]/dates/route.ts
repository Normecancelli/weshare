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

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("customer_dates")
    .select("*")
    .eq("customer_id", id)
    .order("data", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ dates: data || [] });
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

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { data: dateStr, descrizione } = body;

    if (!dateStr || !descrizione?.trim()) {
      return NextResponse.json(
        { error: "Data e descrizione sono obbligatori" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("customer_dates")
      .insert({
        customer_id: id,
        data: dateStr,
        descrizione: descrizione.trim(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ date: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
