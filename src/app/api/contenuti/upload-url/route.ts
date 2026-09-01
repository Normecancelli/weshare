import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canCreateEvent } from "@/lib/auth/roles";
import { UPLOAD_LIMIT_MB, type ContenutoTipo } from "@/lib/types/contenuti";

const ALLOWED_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(createAdminClient(), user.id);
  if (!canCreateEvent(ruolo, qualifica)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { tipo, mimeType, size } = (await request.json()) as {
    tipo: ContenutoTipo; mimeType: string; size: number;
  };

  if (!tipo || !(tipo in UPLOAD_LIMIT_MB)) {
    return NextResponse.json({ error: "Tipo contenuto non valido" }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[mimeType];
  if (!ext) return NextResponse.json({ error: "Formato non supportato (mp4/webm/pdf/mp3/m4a/wav/ogg)" }, { status: 400 });

  const limitBytes = UPLOAD_LIMIT_MB[tipo] * 1024 * 1024;
  if (size > limitBytes) {
    return NextResponse.json(
      { error: `File troppo grande (max ${UPLOAD_LIMIT_MB[tipo]}MB per ${tipo})` },
      { status: 400 }
    );
  }

  const path = `${crypto.randomUUID()}/file.${ext}`;
  const { data, error } = await supabase.storage.from("contenuti").createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Errore generazione URL upload" }, { status: 500 });
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
