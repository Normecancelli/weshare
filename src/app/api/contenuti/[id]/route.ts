import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, isAdminRole } from "@/lib/auth/roles";
import type { ContenutoMediaTipo } from "@/lib/types/contenuti";

const EDITABLE_FIELDS = ["titolo", "descrizione", "tema", "media_tipo", "url_esterno", "file_path", "visibile_prospect"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: existing } = await supabase
    .from("contenuti")
    .select("creato_da, media_tipo, url_esterno, file_path")
    .eq("id", id)
    .single();
  if (!existing) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });

  const { ruolo } = await getUserRoleAndQualifica(createAdminClient(), user.id);
  if (existing.creato_da !== user.id && !isAdminRole(ruolo)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in body) {
        const value = body[field];
        updates[field] = typeof value === "string" ? value.trim() || null : value;
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 });
    }

    if ("media_tipo" in updates) {
      const mediaTipo = updates.media_tipo as ContenutoMediaTipo;
      const urlEsterno = "url_esterno" in updates ? (updates.url_esterno as string | null) : existing.url_esterno;
      const filePath = "file_path" in updates ? (updates.file_path as string | null) : existing.file_path;

      if (mediaTipo === "link_esterno" && !urlEsterno?.trim()) {
        return NextResponse.json({ error: "URL esterno obbligatorio" }, { status: 400 });
      }
      if (mediaTipo === "file" && !filePath?.trim()) {
        return NextResponse.json({ error: "File mancante — caricalo prima di salvare" }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from("contenuti")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contenuto: data });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: existing } = await supabase
    .from("contenuti")
    .select("creato_da, media_tipo, file_path")
    .eq("id", id)
    .single();
  if (!existing) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });

  const { ruolo } = await getUserRoleAndQualifica(createAdminClient(), user.id);
  if (existing.creato_da !== user.id && !isAdminRole(ruolo)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { error } = await supabase.from("contenuti").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing.media_tipo === "file" && existing.file_path) {
    await supabase.storage.from("contenuti").remove([existing.file_path]);
  }

  return NextResponse.json({ success: true });
}
