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
