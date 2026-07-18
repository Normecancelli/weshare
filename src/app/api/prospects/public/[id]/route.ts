import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: prospect } = await admin
    .from("prospects")
    .select("nome, telefono, email, convertito_a")
    .eq("id", id)
    .maybeSingle();

  if (!prospect || prospect.convertito_a) {
    return NextResponse.json({ prospect: null });
  }

  return NextResponse.json({
    prospect: {
      nome: prospect.nome,
      telefono: prospect.telefono,
      email: prospect.email,
    },
  });
}
