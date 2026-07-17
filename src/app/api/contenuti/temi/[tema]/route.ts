import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canCreateEvent } from "@/lib/auth/roles";
import { isIconaTemaValida } from "@/lib/contenuti/icone-temi";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tema: string }> }
) {
  const supabase = await createClient();
  const { tema } = await params;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(createAdminClient(), user.id);
  if (!canCreateEvent(ruolo, qualifica)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const decodedTema = decodeURIComponent(tema).trim();
  if (!decodedTema) return NextResponse.json({ error: "Tema mancante" }, { status: 400 });

  let body: { icona?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  if (!body.icona || !isIconaTemaValida(body.icona)) {
    return NextResponse.json({ error: "Icona non valida" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("temi_icone")
    .upsert({ tema: decodedTema, icona: body.icona }, { onConflict: "tema" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ temaIcona: data });
}
