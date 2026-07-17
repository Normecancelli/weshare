import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const tipo = request.nextUrl.searchParams.get("tipo");
  let query = supabase.from("contenuti").select("tema").not("tema", "is", null);
  if (tipo) query = query.eq("tipo", tipo);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const temi = Array.from(new Set((data || []).map((r) => r.tema as string))).sort((a, b) =>
    a.localeCompare(b, "it")
  );
  return NextResponse.json({ temi });
}
