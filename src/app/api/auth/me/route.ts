import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, isAdminRole } from "@/lib/auth/roles";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null, role: null, ruolo: null, qualifica: null, isAdmin: false });
  }

  const adminClient = createAdminClient();
  const { ruolo, qualifica } = await getUserRoleAndQualifica(adminClient, user.id);

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    role: ruolo,
    ruolo,
    qualifica,
    isAdmin: isAdminRole(ruolo),
  });
}
