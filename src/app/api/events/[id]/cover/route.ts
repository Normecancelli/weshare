import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canManageEvent } from "@/lib/auth/roles";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: existing } = await supabase
    .from("events").select("creato_da, locandina_url").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(supabase, user.id);
  if (!canManageEvent(ruolo, qualifica, existing.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "File mancante" }, { status: 400 });

  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Formato non supportato (jpeg/png/webp)" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File troppo grande (max 5MB)" }, { status: 400 });
  }

  const admin = createAdminClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${id}/cover.${ext}`;

  // Rimuovi cover precedente se esiste
  if (existing.locandina_url) {
    await admin.storage.from("event-covers").remove([`${id}/cover.jpg`, `${id}/cover.png`, `${id}/cover.webp`]);
  }

  const buffer = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from("event-covers")
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage
    .from("event-covers").getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("events").update({ locandina_url: publicUrl }).eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ locandina_url: publicUrl });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: existing } = await supabase
    .from("events").select("creato_da").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(supabase, user.id);
  if (!canManageEvent(ruolo, qualifica, existing.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const admin = createAdminClient();
  await admin.storage.from("event-covers").remove([
    `${id}/cover.jpg`, `${id}/cover.png`, `${id}/cover.webp`
  ]);

  await supabase.from("events").update({ locandina_url: null }).eq("id", id);
  return NextResponse.json({ ok: true });
}
