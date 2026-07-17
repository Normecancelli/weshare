import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS).toISOString();

  const { data, error } = await supabase
    .from("prospect_preview_links")
    .upsert(
      { prospect_id: id, token, expires_at: expiresAt },
      { onConflict: "prospect_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origin = request.nextUrl.origin;
  return NextResponse.json({ url: `${origin}/anteprima/${data.token}`, expiresAt: data.expires_at });
}
