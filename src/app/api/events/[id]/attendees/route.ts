import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canViewAttendees } from "@/lib/auth/roles";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: evento } = await supabase
    .from("events").select("creato_da").eq("id", id).single();
  if (!evento) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(admin, user.id);
  if (!canViewAttendees(ruolo, qualifica, evento.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("event_attendees")
    .select(`
      *,
      profile:profiles!user_id(nome, email, telefono)
    `)
    .eq("event_id", id)
    .order("responded_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const attendees = data || [];
  const confermati = attendees.filter((a) => a.stato === "confermato").length;

  return NextResponse.json({ attendees, confermati });
}
