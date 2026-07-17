import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("prospect_preview_links")
    .select("id, prospect_id, expires_at, view_count")
    .eq("token", token)
    .maybeSingle();

  if (!link) return NextResponse.json({ error: "Link non trovato" }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link scaduto" }, { status: 410 });
  }

  const { data: prospect } = await admin
    .from("prospects")
    .select("partner_id")
    .eq("id", link.prospect_id)
    .single();

  if (!prospect) return NextResponse.json({ error: "Link non trovato" }, { status: 404 });

  const { data: partner } = await admin
    .from("profiles")
    .select("nome, telefono, ruolo, qualifica, platino_riferimento_id")
    .eq("id", prospect.partner_id)
    .single();

  if (!partner) return NextResponse.json({ error: "Link non trovato" }, { status: 404 });

  const [{ data: eventiRaw }, { data: contenutiRaw }] = await Promise.all([
    admin.from("events").select("*").eq("visibile_prospect", true),
    admin.from("contenuti").select("*").eq("visibile_prospect", true),
  ]);

  // Replica in-handler la stessa logica di events_read (migration 014):
  // globale, o creato dal partner, o "gruppo" del platino di riferimento del
  // partner (o il partner stesso ha visibilità elevata).
  const highVisibility = ["admin", "topadmin"].includes(partner.ruolo || "") ||
    ["diamante", "smeraldo", "zaffiro", "rubino"].includes(partner.qualifica || "");

  const eventi = (eventiRaw || []).filter((e) =>
    e.visibilita === "globale" ||
    e.creato_da === prospect.partner_id ||
    (e.visibilita === "gruppo" && (e.platino_id === partner.platino_riferimento_id || highVisibility))
  );

  const contenuti = (contenutiRaw || []).map((c) => ({
    ...c,
    url: c.media_tipo === "link_esterno"
      ? c.url_esterno || ""
      : admin.storage.from("contenuti").getPublicUrl(c.file_path || "").data.publicUrl,
  }));

  // Fire-and-forget: aggiorna contatore visite senza bloccare la risposta.
  admin
    .from("prospect_preview_links")
    .update({ view_count: link.view_count + 1, last_viewed_at: new Date().toISOString() })
    .eq("id", link.id)
    .then(() => {});

  return NextResponse.json({
    partnerNome: partner.nome,
    partnerTelefono: partner.telefono,
    eventi,
    contenuti,
  });
}
