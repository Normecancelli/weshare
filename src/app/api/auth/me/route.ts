import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth/roles";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null, role: null, isAdmin: false });
  }

  const role = await getUserRole(supabase, user.id);

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    role,
    isAdmin: isAdminRole(role),
  });
}
