import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SOURCES = ["contatto_personale", "lista", "social", "referenza", "altro"];

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get("search") || "";
  const stato = request.nextUrl.searchParams.get("stato") || "";

  let query = supabase
    .from("prospects")
    .select("*")
    .eq("partner_id", user.id)
    .order("created_at", { ascending: false });

  if (stato) {
    query = query.eq("stato", stato);
  }

  if (search) {
    query = query.or(
      `nome.ilike.%${search}%,telefono.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ prospects: data || [] });
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
    const { nome, telefono, email, citta, source, note } = body;

    if (!nome || !nome.trim()) {
      return NextResponse.json(
        { error: "Il nome è obbligatorio" },
        { status: 400 }
      );
    }

    const safeSource = SOURCES.includes(source) ? source : "altro";

    const { data, error } = await supabase
      .from("prospects")
      .insert({
        partner_id: user.id,
        nome: nome.trim(),
        telefono: telefono?.trim() || null,
        email: email?.trim() || null,
        citta: citta?.trim() || null,
        source: safeSource,
        note: note?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ prospect: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
