import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRole, isAdminRole } from "@/lib/auth/roles";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const role = await getUserRole(createAdminClient(), user.id);
  if (!isAdminRole(role)) {
    return NextResponse.json(
      { error: "Solo un amministratore può aggiungere prodotti" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const codice = String(body.codice_amway || "").trim();
  const descrizione = String(body.descrizione || "").trim();
  if (!codice || !descrizione) {
    return NextResponse.json(
      { error: "Codice e descrizione sono obbligatori" },
      { status: 400 },
    );
  }

  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("codice_amway", codice)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: `Codice ${codice} già presente` },
      { status: 409 },
    );
  }

  const payload = {
    codice_amway: codice,
    descrizione,
    categoria: body.categoria ? String(body.categoria).trim() : null,
    contenuto: body.contenuto ? String(body.contenuto).trim() : null,
    prezzo_cliente: Number(body.prezzo_cliente) || 0,
    prezzo_partner: Number(body.prezzo_partner) || 0,
    provvigione: Number(body.provvigione) || 0,
    prezzo_unita: body.prezzo_unita ? String(body.prezzo_unita).trim() : null,
    punti_vp: Number(body.punti_vp) || 0,
    volume_vv: Number(body.volume_vv) || 0,
    image_url: body.image_url ? String(body.image_url).trim() : null,
    attivo: true,
  };

  const { data, error } = await supabase
    .from("products")
    .insert(payload)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ product: data }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const categoria = searchParams.get("categoria") || "";

  let query = supabase
    .from("products")
    .select("*")
    .eq("attivo", true)
    .order("descrizione", { ascending: true });

  if (search) {
    query = query.or(
      `descrizione.ilike.%${search}%,codice_amway.ilike.%${search}%`
    );
  }

  if (categoria) {
    query = query.eq("categoria", categoria);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: `Errore caricamento prodotti: ${error.message}` },
      { status: 500 }
    );
  }

  // Also fetch distinct categories for filter dropdown
  const { data: categorieData } = await supabase
    .from("products")
    .select("categoria")
    .eq("attivo", true)
    .not("categoria", "is", null)
    .order("categoria");

  const categorie = [
    ...new Set(
      (categorieData || [])
        .map((r) => r.categoria)
        .filter(Boolean) as string[]
    ),
  ];

  return NextResponse.json({
    products: data || [],
    total: (data || []).length,
    categorie,
  });
}
