import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canCreateEvent } from "@/lib/auth/roles";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const tab = request.nextUrl.searchParams.get("tab") || "attivi";
  const now = new Date().toISOString();

  // Due query separate: una per la lista eventi, una per l'RSVP dell'utente corrente.
  // Non si possono unire in una sola perché il filtro .eq("event_attendees.user_id")
  // applicato alla join !left filtrerebbe anche un eventuale secondo riferimento a event_attendees.
  let eventsQuery = supabase
    .from("events")
    .select("*")
    .order("data_inizio", { ascending: tab === "attivi" });

  if (tab === "attivi") {
    eventsQuery = eventsQuery.gte("data_inizio", now);
  } else {
    eventsQuery = eventsQuery.lt("data_inizio", now);
  }

  const { data, error } = await eventsQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Ottieni RSVP utente per gli eventi caricati
  const eventIds = (data || []).map((e: Record<string, unknown>) => e.id as string);
  let rsvpMap: Record<string, string> = {};
  if (eventIds.length > 0) {
    const { data: rsvps } = await supabase
      .from("event_attendees")
      .select("event_id, stato")
      .eq("user_id", user.id)
      .in("event_id", eventIds);
    rsvpMap = Object.fromEntries((rsvps || []).map((r) => [r.event_id, r.stato]));
  }

  const events = (data || []).map((e: Record<string, unknown>) => ({
    ...e,
    my_rsvp: rsvpMap[e.id as string] ?? null,
    attendees_count: 0, // Non calcolato nella lista per performance — visibile nel dettaglio
  }));

  return NextResponse.json({ events });
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
      nome, descrizione, data_inizio, data_fine, location, location_url,
      modalita, capienza_max, prezzo, link_prenotazione, link_evento,
      visibilita, platino_id, testo_reminder,
    } = body;

    if (!nome?.trim()) return NextResponse.json({ error: "Il nome è obbligatorio" }, { status: 400 });
    if (!data_inizio) return NextResponse.json({ error: "La data di inizio è obbligatoria" }, { status: 400 });

    const { data, error } = await supabase
      .from("events")
      .insert({
        nome: nome.trim(),
        descrizione: descrizione?.trim() || null,
        data_inizio,
        data_fine: data_fine || null,
        location: location?.trim() || null,
        location_url: location_url?.trim() || null,
        modalita: modalita || null,
        capienza_max: capienza_max ? Number(capienza_max) : null,
        prezzo: prezzo ? Number(prezzo) : null,
        link_prenotazione: link_prenotazione?.trim() || null,
        link_evento: link_evento?.trim() || null,
        visibilita: visibilita || "gruppo",
        platino_id: platino_id || null,
        testo_reminder: testo_reminder?.trim() || null,
        creato_da: user.id,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ event: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
