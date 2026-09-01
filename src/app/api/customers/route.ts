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

  const search = request.nextUrl.searchParams.get("search") || "";

  let query = supabase
    .from("customers")
    .select("*")
    .eq("partner_id", user.id)
    .eq("is_interno", false)
    .order("nome", { ascending: true });

  if (search) {
    query = query.or(
      `nome.ilike.%${search}%,cognome.ilike.%${search}%,telefono.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customers: data || [] });
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
    const { nome, cognome, telefono, email, indirizzo, citta, note } = body;

    if (!nome || !nome.trim()) {
      return NextResponse.json(
        { error: "Il nome è obbligatorio" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("customers")
      .insert({
        partner_id: user.id,
        nome: nome.trim(),
        cognome: cognome?.trim() || null,
        telefono: telefono?.trim() || null,
        email: email?.trim() || null,
        indirizzo: indirizzo?.trim() || null,
        citta: citta?.trim() || null,
        note: note?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ customer: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
