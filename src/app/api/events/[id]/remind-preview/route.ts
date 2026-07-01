import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReminderEmail } from "@/lib/events/email";
import type { Evento } from "@/lib/types/events";

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
    .from("events").select("*").eq("id", id).single();
  if (!evento) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { data: profile } = await admin
    .from("profiles").select("nome").eq("id", user.id).single();

  const { data: flagData } = await admin
    .from("system_flags").select("value").eq("flag_name", "email_reminder_template").single();
  const globalTemplate = flagData?.value as string | null;

  const { subject, html } = buildReminderEmail(
    evento as Evento,
    (profile as { nome: string } | null)?.nome || "Partner",
    1,
    globalTemplate
  );

  return NextResponse.json({ subject, html });
}
