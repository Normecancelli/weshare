import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ICONA_TEMA_DEFAULT } from "@/lib/contenuti/icone-temi";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const tipo = request.nextUrl.searchParams.get("tipo");
  let query = supabase.from("contenuti").select("tema").not("tema", "is", null);
  if (tipo) query = query.eq("tipo", tipo);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const temiDistinti = Array.from(new Set((data || []).map((r) => r.tema as string))).sort((a, b) =>
    a.localeCompare(b, "it")
  );

  if (temiDistinti.length === 0) {
    return NextResponse.json({ temi: [] });
  }

  const { data: iconeRaw } = await supabase
    .from("temi_icone")
    .select("tema, icona")
    .in("tema", temiDistinti);

  const iconeMap = new Map((iconeRaw || []).map((r) => [r.tema, r.icona]));
  const temi = temiDistinti.map((t) => ({ tema: t, icona: iconeMap.get(t) || ICONA_TEMA_DEFAULT }));

  return NextResponse.json({ temi });
}
