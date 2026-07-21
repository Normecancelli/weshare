import type { SupabaseClient } from "@supabase/supabase-js";

export async function countConfirmedAttendees(
  admin: SupabaseClient,
  eventId: string
): Promise<number> {
  const [{ count: partnerCount }, { count: prospectCount }] = await Promise.all([
    admin
      .from("event_attendees")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("stato", "confermato"),
    admin
      .from("event_prospect_bookings")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("stato", "confermato"),
  ]);
  return (partnerCount || 0) + (prospectCount || 0);
}

export async function prenotaEvento(
  admin: SupabaseClient,
  eventId: string,
  prospectId: string
): Promise<{ stato: "confermato" | "in_attesa" } | { error: string }> {
  const { data: evento, error: eventoErr } = await admin
    .from("events")
    .select("capienza_max")
    .eq("id", eventId)
    .single();
  if (eventoErr || !evento) return { error: "Evento non trovato" };

  const { data: existing } = await admin
    .from("event_prospect_bookings")
    .select("stato")
    .eq("event_id", eventId)
    .eq("prospect_id", prospectId)
    .maybeSingle();

  let stato: "confermato" | "in_attesa" = "confermato";
  const giaConfermato = existing?.stato === "confermato";

  if (evento.capienza_max != null && !giaConfermato) {
    const confermatiAttuali = await countConfirmedAttendees(admin, eventId);
    if (confermatiAttuali >= evento.capienza_max) stato = "in_attesa";
  }

  const { error: upsertErr } = await admin
    .from("event_prospect_bookings")
    .upsert(
      { event_id: eventId, prospect_id: prospectId, stato },
      { onConflict: "event_id,prospect_id" }
    );
  if (upsertErr) return { error: upsertErr.message };

  return { stato };
}

export interface ReminderRecipient {
  nome: string;
  email: string;
}

export async function getConfirmedRecipients(
  admin: SupabaseClient,
  eventId: string
): Promise<ReminderRecipient[]> {
  const [{ data: attendees }, { data: bookings }] = await Promise.all([
    admin
      .from("event_attendees")
      .select("*, profile:profiles!user_id(nome, email)")
      .eq("event_id", eventId)
      .eq("stato", "confermato"),
    admin
      .from("event_prospect_bookings")
      .select("*, prospect:prospects!prospect_id(nome, email)")
      .eq("event_id", eventId)
      .eq("stato", "confermato"),
  ]);

  const recipients: ReminderRecipient[] = [];
  for (const a of (attendees || []) as { profile: { nome: string; email: string } | null }[]) {
    if (a.profile?.email) recipients.push({ nome: a.profile.nome, email: a.profile.email });
  }
  for (const b of (bookings || []) as { prospect: { nome: string; email: string | null } | null }[]) {
    if (b.prospect?.email) recipients.push({ nome: b.prospect.nome, email: b.prospect.email });
  }
  return recipients;
}
