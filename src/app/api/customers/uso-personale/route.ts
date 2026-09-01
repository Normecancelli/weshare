import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: existing } = await supabase
    .from("customers")
    .select("*")
    .eq("partner_id", user.id)
    .eq("is_interno", true)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ customer: existing });
  }

  const { data: created, error } = await supabase
    .from("customers")
    .insert({ partner_id: user.id, nome: "Uso personale", is_interno: true })
    .select()
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message || "Errore creazione" }, { status: 500 });
  }

  return NextResponse.json({ customer: created }, { status: 201 });
}
