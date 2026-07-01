import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRole, isAdminRole } from "@/lib/auth/roles";

export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data } = await supabase
    .from("system_flags").select("value").eq("flag_name", "email_reminder_template").single();

  return NextResponse.json({ template: data?.value || null });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const ruolo = await getUserRole(createAdminClient(), user.id);
  if (!isAdminRole(ruolo)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { template } = await request.json();
  await supabase.from("system_flags").upsert(
    { flag_name: "email_reminder_template", value: template },
    { onConflict: "flag_name" }
  );

  return NextResponse.json({ ok: true });
}
