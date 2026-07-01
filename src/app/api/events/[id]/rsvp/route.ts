import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RsvpStato } from "@/lib/types/events";

const STATI_VALIDI: RsvpStato[] = ["confermato", "forse", "annullato"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  try {
    const { stato } = await request.json() as { stato: RsvpStato };
    if (!STATI_VALIDI.includes(stato)) {
      return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("event_attendees")
      .upsert(
        { event_id: id, user_id: user.id, stato, responded_at: new Date().toISOString() },
        { onConflict: "event_id,user_id" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ attendee: data });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
