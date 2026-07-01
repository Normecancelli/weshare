import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canManageEvent } from "@/lib/auth/roles";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data, error } = await supabase
    .from("events")
    .select(`
      *,
      my_rsvp:event_attendees!left(stato),
      attendees_count:event_attendees(count)
    `)
    .eq("id", id)
    .eq("event_attendees.user_id", user.id)
    .single();

  if (error) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const event = {
    ...data,
    my_rsvp: Array.isArray(data.my_rsvp) && data.my_rsvp.length > 0
      ? (data.my_rsvp as Array<{stato: string}>)[0].stato
      : null,
    attendees_count: Array.isArray(data.attendees_count)
      ? (data.attendees_count as Array<{count: number}>)[0]?.count ?? 0
      : 0,
  };

  return NextResponse.json({ event });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: existing } = await supabase
    .from("events").select("creato_da").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(createAdminClient(), user.id);
  if (!canManageEvent(ruolo, qualifica, existing.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const allowed = [
      "nome","descrizione","data_inizio","data_fine","location","location_url",
      "modalita","capienza_max","prezzo","link_prenotazione","link_evento",
      "visibilita","platino_id","testo_reminder",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await supabase
      .from("events").update(updates).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ event: data });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
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

  const { ruolo, qualifica } = await getUserRoleAndQualifica(createAdminClient(), user.id);
  if (!canManageEvent(ruolo, qualifica, existing.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
