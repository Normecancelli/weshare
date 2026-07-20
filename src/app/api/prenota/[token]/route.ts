import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateProspect } from "@/lib/prospects/find-or-create";
import { prenotaEvento, countConfirmedAttendees } from "@/lib/events/prenotazione";
import { buildBookingConfirmationEmail } from "@/lib/events/email";
import type { Evento } from "@/lib/types/events";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("event_booking_links")
    .select("id, event_id, view_count")
    .eq("token", token)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "Link non trovato" }, { status: 404 });

  const { data: evento } = await admin
    .from("events").select("*").eq("id", link.event_id).single();
  if (!evento) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });
  if (new Date(evento.data_inizio) < new Date()) {
    return NextResponse.json({ error: "Questo evento è già passato" }, { status: 410 });
  }

  let postiRimasti: number | null = null;
  if (evento.capienza_max != null) {
    const confermati = await countConfirmedAttendees(admin, evento.id);
    postiRimasti = Math.max(0, evento.capienza_max - confermati);
  }

  admin
    .from("event_booking_links")
    .update({ view_count: link.view_count + 1 })
    .eq("id", link.id)
    .then(() => {});

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
  });
}

interface PrenotaBody {
  nome?: string;
  cognome?: string;
  telefono?: string;
  email?: string;
  website?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("event_booking_links")
    .select("event_id, partner_id")
    .eq("token", token)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "Link non trovato" }, { status: 404 });

  let body: PrenotaBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  if (body.website && body.website.trim()) {
    return NextResponse.json({ stato: "confermato" });
  }

  const nome = (body.nome || "").trim();
  const cognome = (body.cognome || "").trim();
  const telefono = (body.telefono || "").trim();
  const email = (body.email || "").trim();

  if (!nome || (!telefono && !email)) {
    return NextResponse.json(
      { error: "Nome e almeno un contatto (telefono o email) sono obbligatori" },
      { status: 400 }
    );
  }

  const { data: evento } = await admin
    .from("events").select("*").eq("id", link.event_id).single();
  if (!evento) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const nomeCompleto = [nome, cognome].filter(Boolean).join(" ");

  const prospectResult = await findOrCreateProspect(admin, link.partner_id, {
    nome: nomeCompleto,
    telefono,
    email,
    source: "prenotazione_evento",
  });
  if ("error" in prospectResult) {
    return NextResponse.json({ error: prospectResult.error }, { status: 500 });
  }

  const bookingResult = await prenotaEvento(admin, evento.id, prospectResult.id);
  if ("error" in bookingResult) {
    return NextResponse.json({ error: bookingResult.error }, { status: 500 });
  }

  if (email) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { subject, html } = buildBookingConfirmationEmail(evento as Evento, nomeCompleto, bookingResult.stato);
    resend.emails.send({
      from: "WeShare <noreply@growset.it>",
      to: email,
      subject,
      html,
    }).catch((err) => {
      console.error("[api/prenota] Errore invio email conferma", err);
    });
  }

  return NextResponse.json({ stato: bookingResult.stato });
}
