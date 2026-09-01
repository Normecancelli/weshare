import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: existing } = await supabase
    .from("contenuto_likes")
    .select("contenuto_id")
    .eq("contenuto_id", id)
    .eq("partner_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("contenuto_likes")
      .delete()
      .eq("contenuto_id", id)
      .eq("partner_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from("contenuto_likes")
      .insert({ contenuto_id: id, partner_id: user.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count } = await supabase
    .from("contenuto_likes")
    .select("*", { count: "exact", head: true })
    .eq("contenuto_id", id);

  return NextResponse.json({ liked_by_me: !existing, likes_count: count || 0 });
}
