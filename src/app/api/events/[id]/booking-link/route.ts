import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canManageEvent } from "@/lib/auth/roles";

export async function POST(
  request: NextRequest,
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
  if (!canManageEvent(ruolo, qualifica, evento.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const origin = request.nextUrl.origin;

  const { data: existing } = await admin
    .from("event_booking_links")
    .select("token")
    .eq("event_id", id)
    .eq("partner_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ url: `${origin}/prenota/${existing.token}` });
  }

  const token = crypto.randomUUID().replace(/-/g, "");
  const { data: created, error } = await admin
    .from("event_booking_links")
    .insert({ event_id: id, partner_id: user.id, token })
    .select("token")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "Errore durante la generazione del link" }, { status: 500 });
  }

  return NextResponse.json({ url: `${origin}/prenota/${created.token}` });
}
