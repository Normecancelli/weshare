import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReminderEmail, type ReminderTier } from "@/lib/events/email";
import { getConfirmedRecipients } from "@/lib/events/prenotazione";
import type { Evento } from "@/lib/types/events";

const TIERS: { tier: ReminderTier; flag: "reminder_sent_7d" | "reminder_sent_1d" | "reminder_sent_2h"; hoursAhead: number }[] = [
  { tier: "7d", flag: "reminder_sent_7d", hoursAhead: 168 },
  { tier: "1d", flag: "reminder_sent_1d", hoursAhead: 24 },
  { tier: "2h", flag: "reminder_sent_2h", hoursAhead: 2 },
];

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const admin = createAdminClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data: flagData } = await admin
    .from("system_flags").select("value").eq("flag_name", "email_reminder_template").single();
  const globalTemplate = flagData?.value as string | null;

  const now = new Date();
  const sentByTier: Record<ReminderTier, number> = { "7d": 0, "1d": 0, "2h": 0 };

  for (const { tier, flag, hoursAhead } of TIERS) {
    const threshold = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000).toISOString();
    const { data: events, error: eventsError } = await admin
      .from("events")
      .select("*")
      .eq(flag, false)
      .gt("data_inizio", now.toISOString())
      .lte("data_inizio", threshold);

    if (eventsError) {
      console.error(`[cron/event-reminders] Errore query tier ${tier}:`, eventsError);
    }

    for (const evento of events || []) {
      const recipients = await getConfirmedRecipients(admin, evento.id);
      for (const r of recipients) {
        const { subject, html } = buildReminderEmail(evento as Evento, r.nome, tier, globalTemplate);
        const { error } = await resend.emails.send({
          from: "WeShare <noreply@growset.it>",
          to: r.email,
          subject,
          html,
        });
        if (!error) sentByTier[tier]++;
      }
      await admin.from("events").update({ [flag]: true }).eq("id", evento.id);
    }
  }

  console.log("[cron/event-reminders]", sentByTier);
  return NextResponse.json(sentByTier);
}
