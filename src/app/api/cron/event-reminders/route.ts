import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReminderEmail } from "@/lib/events/email";
import type { Evento } from "@/lib/types/events";

function getDayRange(daysAhead: number): { from: string; to: string } {
  const target = new Date();
  target.setDate(target.getDate() + daysAhead);
  const from = new Date(target);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(target);
  to.setUTCHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function sendRemindersForDay(
  supabase: ReturnType<typeof createAdminClient>,
  resend: Resend,
  daysAhead: 1 | 7,
  globalTemplate: string | null
): Promise<number> {
  const { from, to } = getDayRange(daysAhead);
  const flagField = daysAhead === 7 ? "reminder_sent_7d" : "reminder_sent_1d";

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .gte("data_inizio", from)
    .lte("data_inizio", to)
    .eq(flagField, false);

  if (!events?.length) return 0;

  let total = 0;
  for (const evento of events) {
    const { data: attendees } = await supabase
      .from("event_attendees")
      .select("*, profile:profiles!user_id(nome, email)")
      .eq("event_id", evento.id)
      .eq("stato", "confermato");

    for (const a of attendees || []) {
      const profile = a.profile as { nome: string; email: string } | null;
      if (!profile?.email) continue;
      const { subject, html } = buildReminderEmail(
        evento as Evento, profile.nome, daysAhead, globalTemplate
      );
      const { error } = await resend.emails.send({
        from: "WeShare <noreply@growset.it>",
        to: profile.email,
        subject,
        html,
      });
      if (!error) total++;
    }

    // Segna il flag per evitare doppi invii
    await supabase.from("events").update({ [flagField]: true }).eq("id", evento.id);
  }

  return total;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data: flagData } = await supabase
    .from("system_flags").select("value").eq("flag_name", "email_reminder_template").single();
  const globalTemplate = flagData?.value as string | null;

  const sent7d = await sendRemindersForDay(supabase, resend, 7, globalTemplate);
  const sent1d = await sendRemindersForDay(supabase, resend, 1, globalTemplate);

  console.log(`[cron/event-reminders] sent: ${sent7d} (7gg) + ${sent1d} (1gg)`);
  return NextResponse.json({ sent_7d: sent7d, sent_1d: sent1d });
}
