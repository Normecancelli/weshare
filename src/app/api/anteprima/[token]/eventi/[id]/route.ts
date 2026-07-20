import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { prenotaEvento, countConfirmedAttendees } from "@/lib/events/prenotazione";
import { buildBookingConfirmationEmail } from "@/lib/events/email";
import type { Evento } from "@/lib/types/events";

async function resolveVisibleEvento(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
  eventId: string
) {
  const { data: link } = await admin
    .from("prospect_preview_links")
    .select("prospect_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!link) return { error: "Link non trovato", status: 404 } as const;
  if (new Date(link.expires_at) < new Date()) {
    return { error: "Link scaduto", status: 410 } as const;
  }

  const { data: prospect } = await admin
    .from("prospects")
    .select("partner_id, nome, telefono, email")
    .eq("id", link.prospect_id)
    .single();
  if (!prospect) return { error: "Link non trovato", status: 404 } as const;

  const { data: partner } = await admin
    .from("profiles")
    .select("ruolo, qualifica, platino_riferimento_id")
    .eq("id", prospect.partner_id)
    .single();
  if (!partner) return { error: "Link non trovato", status: 404 } as const;

  const { data: evento } = await admin
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("visibile_prospect", true)
    .maybeSingle();
  if (!evento) return { error: "Evento non trovato", status: 404 } as const;

  const highVisibility = ["admin", "topadmin"].includes(partner.ruolo || "") ||
    ["diamante", "smeraldo", "zaffiro", "rubino"].includes(partner.qualifica || "");
  const visibile = evento.visibilita === "globale" ||
    evento.creato_da === prospect.partner_id ||
    (evento.visibilita === "gruppo" && (
      (evento.platino_id != null && evento.platino_id === partner.platino_riferimento_id) || highVisibility
    ));
  if (!visibile) return { error: "Evento non trovato", status: 404 } as const;

  return { prospectId: link.prospect_id, prospect, evento } as const;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;
  const admin = createAdminClient();

  const resolved = await resolveVisibleEvento(admin, token, id);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { evento, prospect } = resolved;

  if (new Date(evento.data_inizio) < new Date()) {
    return NextResponse.json({ error: "Questo evento è già passato" }, { status: 410 });
  }

  let postiRimasti: number | null = null;
  if (evento.capienza_max != null) {
    const confermati = await countConfirmedAttendees(admin, evento.id);
    postiRimasti = Math.max(0, evento.capienza_max - confermati);
  }

  return NextResponse.json({
    evento: {
      id: evento.id,
      nome: evento.nome,
      descrizione: evento.descrizione,
      data_inizio: evento.data_inizio,
      location: evento.location,
      location_url: evento.location_url,
      modalita: evento.modalita,
      prezzo: evento.prezzo,
      locandina_url: evento.locandina_url,
      link_evento: evento.link_evento,
    },
    postiRimasti,
    prospect: { nome: prospect.nome, telefono: prospect.telefono, email: prospect.email },
  });
}

interface PrenotaBody {
  nome?: string;
  telefono?: string;
  email?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;
  const admin = createAdminClient();

  const resolved = await resolveVisibleEvento(admin, token, id);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { evento, prospectId } = resolved;

  if (new Date(evento.data_inizio) < new Date()) {
    return NextResponse.json({ error: "Questo evento è già passato" }, { status: 410 });
  }

  let body: PrenotaBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const nome = (body.nome || "").trim();
  const telefono = (body.telefono || "").trim();
  const email = (body.email || "").trim();

  if (!nome || (!telefono && !email)) {
    return NextResponse.json(
      { error: "Nome e almeno un contatto (telefono o email) sono obbligatori" },
      { status: 400 }
    );
  }

  const { error: updateErr } = await admin
    .from("prospects")
    .update({
      nome,
      ...(telefono ? { telefono } : {}),
      ...(email ? { email } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", prospectId);
  if (updateErr) {
    return NextResponse.json({ error: "Errore durante il salvataggio" }, { status: 500 });
  }

  const bookingResult = await prenotaEvento(admin, evento.id, prospectId);
  if ("error" in bookingResult) {
    return NextResponse.json({ error: bookingResult.error }, { status: 500 });
  }

  if (email) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { subject, html } = buildBookingConfirmationEmail(evento as Evento, nome, bookingResult.stato);
    resend.emails.send({
      from: "WeShare <noreply@growset.it>",
      to: email,
      subject,
      html,
    }).catch((err) => {
      console.error("[api/anteprima/eventi] Errore invio email conferma", err);
    });
  }

  return NextResponse.json({ stato: bookingResult.stato });
}
