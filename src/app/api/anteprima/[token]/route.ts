import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ICONA_TEMA_DEFAULT } from "@/lib/contenuti/icone-temi";

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
    admin
      .from("events")
      .select("id, nome, data_inizio, location, visibilita, creato_da, platino_id")
      .eq("visibile_prospect", true),
    admin
      .from("contenuti")
      .select("id, titolo, descrizione, tema, media_tipo, url_esterno, file_path")
      .eq("visibile_prospect", true),
  ]);

  // Replica in-handler la stessa logica di events_read (migration 014):
  // globale, o creato dal partner, o "gruppo" del platino di riferimento del
  // partner (o il partner stesso ha visibilità elevata).
  const highVisibility = ["admin", "topadmin"].includes(partner.ruolo || "") ||
    ["diamante", "smeraldo", "zaffiro", "rubino"].includes(partner.qualifica || "");

  // e.platino_id != null: replica la semantica SQL di "NULL IN (...)" (sempre
  // unknown/false), evitando che un evento gruppo senza platino_id diventi
  // visibile a qualsiasi partner con platino_riferimento_id anch'esso NULL.
  const eventi = (eventiRaw || [])
    .filter((e) =>
      e.visibilita === "globale" ||
      e.creato_da === prospect.partner_id ||
      (e.visibilita === "gruppo" && ((e.platino_id != null && e.platino_id === partner.platino_riferimento_id) || highVisibility))
    )
    .map((e) => ({ id: e.id, nome: e.nome, data_inizio: e.data_inizio, location: e.location }));

  const contenuti = (contenutiRaw || []).map((c) => ({
    id: c.id,
    titolo: c.titolo,
    descrizione: c.descrizione,
    tema: c.tema,
    media_tipo: c.media_tipo,
    url: c.media_tipo === "link_esterno"
      ? c.url_esterno || ""
      : admin.storage.from("contenuti").getPublicUrl(c.file_path || "").data.publicUrl,
  }));

  const temiUsati = Array.from(
    new Set((contenutiRaw || []).map((c) => c.tema).filter((t): t is string => !!t))
  );
  let temi: { tema: string; icona: string }[] = [];
  if (temiUsati.length > 0) {
    const { data: iconeRaw } = await admin
      .from("temi_icone")
      .select("tema, icona")
      .in("tema", temiUsati);
    const iconeMap = new Map((iconeRaw || []).map((r) => [r.tema, r.icona]));
    temi = temiUsati
      .sort((a, b) => a.localeCompare(b, "it"))
      .map((t) => ({ tema: t, icona: iconeMap.get(t) || ICONA_TEMA_DEFAULT }));
  }

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
    temi,
  });
}
