import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canCreateEvent } from "@/lib/auth/roles";
import { UPLOAD_LIMIT_MB, type ContenutoTipo } from "@/lib/types/contenuti";

const ALLOWED_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(createAdminClient(), user.id);
  if (!canCreateEvent(ruolo, qualifica)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const tipo = formData.get("tipo") as ContenutoTipo | null;

  if (!file) return NextResponse.json({ error: "File mancante" }, { status: 400 });
  if (!tipo || !(tipo in UPLOAD_LIMIT_MB)) {
    return NextResponse.json({ error: "Tipo contenuto non valido" }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Formato non supportato (mp4/webm/pdf)" }, { status: 400 });

  const limitBytes = UPLOAD_LIMIT_MB[tipo] * 1024 * 1024;
  if (file.size > limitBytes) {
    return NextResponse.json(
      { error: `File troppo grande (max ${UPLOAD_LIMIT_MB[tipo]}MB per ${tipo})` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const path = `${crypto.randomUUID()}/file.${ext}`;
  const buffer = await file.arrayBuffer();

  const { error: uploadError } = await admin.storage
    .from("contenuti")
    .upload(path, buffer, { contentType: file.type });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from("contenuti").getPublicUrl(path);
  return NextResponse.json({ file_path: path, url: publicUrl });
}
