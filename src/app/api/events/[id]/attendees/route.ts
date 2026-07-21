import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canViewAttendees } from "@/lib/auth/roles";
import type { AttendeeRow } from "@/lib/types/events";

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

  const [{ data: partnerAttendees, error: partnerErr }, { data: prospectBookings, error: prospectErr }] = await Promise.all([
    admin
      .from("event_attendees")
      .select(`*, profile:profiles!user_id(nome, email, telefono)`)
      .eq("event_id", id)
      .order("responded_at", { ascending: false }),
    admin
      .from("event_prospect_bookings")
      .select(`*, prospect:prospects!prospect_id(nome, telefono, email, partner:profiles!partner_id(nome))`)
      .eq("event_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (partnerErr) return NextResponse.json({ error: partnerErr.message }, { status: 500 });
  if (prospectErr) return NextResponse.json({ error: prospectErr.message }, { status: 500 });

  type PartnerAttendeeRow = { user_id: string; stato: string; profile: { nome: string; email: string; telefono: string | null } | null };
  type ProspectBookingRow = { prospect_id: string; stato: string; prospect: { nome: string; telefono: string | null; email: string | null; partner: { nome: string } | null } | null };

  const attendees: AttendeeRow[] = [
    ...((partnerAttendees || []) as PartnerAttendeeRow[]).map((a) => ({
      tipo: "partner" as const,
      id: a.user_id,
      nome: a.profile?.nome || "",
      email: a.profile?.email || null,
      telefono: a.profile?.telefono || null,
      stato: a.stato as AttendeeRow["stato"],
    })),
    ...((prospectBookings || []) as ProspectBookingRow[]).map((b) => ({
      tipo: "prospect" as const,
      id: b.prospect_id,
      nome: b.prospect?.nome || "",
      email: b.prospect?.email || null,
      telefono: b.prospect?.telefono || null,
      stato: b.stato as AttendeeRow["stato"],
      partnerNome: b.prospect?.partner?.nome,
    })),
  ];

  const confermati = attendees.filter((a) => a.stato === "confermato").length;
  const inAttesa = attendees.filter((a) => a.stato === "in_attesa").length;

  return NextResponse.json({ attendees, confermati, inAttesa });
}
