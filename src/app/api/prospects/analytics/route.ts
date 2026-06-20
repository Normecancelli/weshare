import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STATI = [
  "nuovo_contatto",
  "primo_appt",
  "secondo_appt",
  "convertito_cliente",
  "convertito_partner",
  "follow_up",
] as const;

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("prospects")
    .select("stato, created_at, data_conversione, convertito_a")
    .eq("partner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const totale = rows.length;

  const pipeline = Object.fromEntries(STATI.map((s) => [s, 0])) as Record<
    (typeof STATI)[number],
    number
  >;
  for (const r of rows) {
    if (r.stato in pipeline) pipeline[r.stato as (typeof STATI)[number]]++;
  }

  const cliente = pipeline.convertito_cliente;
  const partner = pipeline.convertito_partner;

  // Average days from creation to conversion
  const durations: number[] = [];
  for (const r of rows) {
    if (r.convertito_a && r.data_conversione) {
      const d =
        (new Date(r.data_conversione).getTime() -
          new Date(r.created_at).getTime()) /
        86400000;
      if (d >= 0) durations.push(d);
    }
  }
  const tempo_medio_giorni =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  // This month vs last month, by conversion date
  const now = new Date();
  const startThis = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  let convertiti_questo_mese = 0;
  let convertiti_mese_scorso = 0;
  for (const r of rows) {
    if (!r.convertito_a || !r.data_conversione) continue;
    const dc = new Date(r.data_conversione);
    if (dc >= startThis) convertiti_questo_mese++;
    else if (dc >= startLast && dc < startThis) convertiti_mese_scorso++;
  }

  return NextResponse.json({
    pipeline,
    totale,
    conversione: {
      cliente,
      partner,
      cliente_percent: totale > 0 ? Math.round((cliente / totale) * 100) : 0,
      partner_percent: totale > 0 ? Math.round((partner / totale) * 100) : 0,
      tempo_medio_giorni,
      convertiti_questo_mese,
      convertiti_mese_scorso,
    },
  });
}
