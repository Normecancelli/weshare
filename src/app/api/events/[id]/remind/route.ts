import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canSendReminder } from "@/lib/auth/roles";
import { buildReminderEmail } from "@/lib/events/email";
import type { Evento } from "@/lib/types/events";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: evento } = await supabase
    .from("events").select("*").eq("id", id).single();
  if (!evento) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(admin, user.id);
  if (!canSendReminder(ruolo, qualifica, evento.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  // Carica template globale da system_flags (flag_name = chiave)
  const { data: flagData } = await admin
    .from("system_flags").select("value").eq("flag_name", "email_reminder_template").single();
  const globalTemplate = flagData?.value as string | null;

  const { data: attendees } = await admin
    .from("event_attendees")
    .select("*, profile:profiles!user_id(nome, email)")
    .eq("event_id", id)
    .eq("stato", "confermato");

  if (!attendees?.length) return NextResponse.json({ sent: 0 });

  let sent = 0;
  for (const a of attendees) {
    const profile = a.profile as { nome: string; email: string } | null;
    if (!profile?.email) continue;
    const { subject, html } = buildReminderEmail(evento as Evento, profile.nome, 1, globalTemplate);
    const { error } = await resend.emails.send({
      from: "WeShare <noreply@growset.it>",
      to: profile.email,
      subject,
      html,
    });
    if (!error) sent++;
  }

  return NextResponse.json({ sent });
}
