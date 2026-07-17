import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canCreateEvent } from "@/lib/auth/roles";
import type { ContenutoTipo, ContenutoMediaTipo } from "@/lib/types/contenuti";

function resolveUrl(
  supabase: SupabaseClient,
  row: { media_tipo: ContenutoMediaTipo; url_esterno: string | null; file_path: string | null }
) {
  if (row.media_tipo === "link_esterno") return row.url_esterno || "";
  const { data } = supabase.storage.from("contenuti").getPublicUrl(row.file_path || "");
  return data.publicUrl;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const tipo = request.nextUrl.searchParams.get("tipo");
  const tema = request.nextUrl.searchParams.get("tema");

  let query = supabase.from("contenuti").select("*").order("created_at", { ascending: false });
  if (tipo) query = query.eq("tipo", tipo);
  if (tema) query = query.eq("tema", tema);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const contenuti = (data || []).map((row) => ({ ...row, url: resolveUrl(supabase, row) }));
  return NextResponse.json({ contenuti });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(createAdminClient(), user.id);
  if (!canCreateEvent(ruolo, qualifica)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      tipo, titolo, descrizione, tema, media_tipo,
      url_esterno, file_path, visibile_prospect,
    }: {
      tipo: ContenutoTipo; titolo: string; descrizione?: string; tema?: string;
      media_tipo: ContenutoMediaTipo; url_esterno?: string; file_path?: string;
      visibile_prospect?: boolean;
    } = body;

    if (!titolo?.trim()) return NextResponse.json({ error: "Il titolo è obbligatorio" }, { status: 400 });
    if (!["formazione", "presentazione"].includes(tipo)) {
      return NextResponse.json({ error: "Tipo non valido" }, { status: 400 });
    }
    if (media_tipo === "link_esterno" && !url_esterno?.trim()) {
      return NextResponse.json({ error: "URL esterno obbligatorio" }, { status: 400 });
    }
    if (media_tipo === "file" && !file_path?.trim()) {
      return NextResponse.json({ error: "File mancante — caricalo prima di salvare" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("contenuti")
      .insert({
        tipo,
        titolo: titolo.trim(),
        descrizione: descrizione?.trim() || null,
        tema: tema?.trim() || null,
        media_tipo,
        url_esterno: media_tipo === "link_esterno" ? url_esterno!.trim() : null,
        file_path: media_tipo === "file" ? file_path!.trim() : null,
        visibile_prospect: !!visibile_prospect,
        creato_da: user.id,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contenuto: { ...data, url: resolveUrl(supabase, data) } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
