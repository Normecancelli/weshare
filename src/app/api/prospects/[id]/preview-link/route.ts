import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { upsertPreviewLink } from "@/lib/prospects/preview-link";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: prospect } = await supabase
    .from("prospects")
    .select("id")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (!prospect) return NextResponse.json({ error: "Contatto non trovato" }, { status: 404 });

  const result = await upsertPreviewLink(supabase, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500 });

  const origin = request.nextUrl.origin;
  return NextResponse.json({ url: `${origin}/anteprima/${result.token}`, expiresAt: result.expiresAt });
}
