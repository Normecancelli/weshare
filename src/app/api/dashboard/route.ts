import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // Trova l'ultimo mese importato
  const { data: lastImport } = await supabase
    .from("imports")
    .select("mese_riferimento")
    .eq("uploaded_by", user.id)
    .eq("status", "completed")
    .order("mese_riferimento", { ascending: false })
    .limit(1)
    .single();

  if (!lastImport) {
    return NextResponse.json({ empty: true, message: "Nessun dato importato" });
  }

  const meseCorrente = lastImport.mese_riferimento;

  // Trova il mese precedente disponibile
  const { data: allMesi } = await supabase
    .from("imports")
    .select("mese_riferimento")
    .eq("uploaded_by", user.id)
    .eq("status", "completed")
    .order("mese_riferimento", { ascending: false });

  const mesePrecedente =
    allMesi && allMesi.length > 1 ? allMesi[1].mese_riferimento : null;

  // Dati del mese corrente — primo record è l'utente stesso (livello 1)
  const { data: currentData } = await supabase
    .from("monthly_data")
    .select("*")
    .eq("mese_riferimento", meseCorrente)
    .order("livello", { ascending: true });

  // Dati del mese precedente per confronto
  let prevData: typeof currentData = null;
  if (mesePrecedente) {
    const { data } = await supabase
      .from("monthly_data")
      .select("*")
      .eq("mese_riferimento", mesePrecedente)
      .order("livello", { ascending: true });
    prevData = data;
  }

  if (!currentData || currentData.length === 0) {
    return NextResponse.json({ empty: true });
  }

  // Il primo record (livello 1) è l'utente
  const me = currentData.find((r) => r.livello === 1);
  const team = currentData.filter((r) => r.livello > 1);
  const directDownline = currentData.filter((r) => r.livello === 2);

  // Dati mese precedente per confronto
  const mePrev = prevData?.find((r) => r.livello === 1);
  const teamPrev = prevData?.filter((r) => r.livello > 1);

  // Calcola statistiche
  const totalVpg = me?.vpg || 0;
  const totalVpp = me?.vpp || 0;
  const prevVpg = mePrev?.vpg || 0;
  const bonusPerc = me?.percentuale_bonus || 0;
  const teamAttivo = team.filter(
    (m) => (m.vpp || 0) > 0 || (m.num_ordini_personali || 0) > 0
  ).length;
  const prevTeamAttivo = teamPrev
    ? teamPrev.filter(
        (m) => (m.vpp || 0) > 0 || (m.num_ordini_personali || 0) > 0
      ).length
    : 0;
  const totalOrdini = currentData.reduce(
    (sum, r) => sum + (r.num_ordini_personali || 0),
    0
  );
  const prevTotalOrdini = prevData
    ? prevData.reduce((sum, r) => sum + (r.num_ordini_personali || 0), 0)
    : 0;
  const numClienti = me?.num_clienti || 0;

  // Trend storico VPG (tutti i mesi disponibili)
  const trend: { mese: string; vpg: number }[] = [];
  if (allMesi) {
    for (const m of allMesi.reverse()) {
      const { data: meseData } = await supabase
        .from("monthly_data")
        .select("vpg")
        .eq("mese_riferimento", m.mese_riferimento)
        .eq("livello", 1)
        .single();
      if (meseData) {
        trend.push({
          mese: m.mese_riferimento,
          vpg: meseData.vpg || 0,
        });
      }
    }
  }

  // Top downline diretti per VPG
  const topDownline = directDownline
    .sort((a, b) => (b.vpg || 0) - (a.vpg || 0))
    .slice(0, 5)
    .map((m) => ({
      nome: m.nome,
      codice: m.codice_partner,
      vpg: m.vpg || 0,
      vpp: m.vpp || 0,
      bonus: m.percentuale_bonus || 0,
      dimensioni_gruppo: m.dimensioni_gruppo || 0,
    }));

  // Formattazione mese
  function formatMese(mese: string) {
    const mesi = [
      "",
      "Gen",
      "Feb",
      "Mar",
      "Apr",
      "Mag",
      "Giu",
      "Lug",
      "Ago",
      "Set",
      "Ott",
      "Nov",
      "Dic",
    ];
    return `${mesi[parseInt(mese.slice(4, 6))]} ${mese.slice(0, 4)}`;
  }

  return NextResponse.json({
    meseCorrente,
    meseCorrenteLabel: formatMese(meseCorrente),
    mesePrecedente,
    mesePrecedenteLabel: mesePrecedente ? formatMese(mesePrecedente) : null,
    stats: {
      vpg: totalVpg,
      vpgPrev: prevVpg,
      vpgTrend:
        prevVpg > 0
          ? Math.round(((totalVpg - prevVpg) / prevVpg) * 100)
          : null,
      vpp: totalVpp,
      bonusPerc,
      teamTotale: team.length,
      teamAttivo,
      teamAttivoTrend: teamAttivo - prevTeamAttivo,
      ordini: totalOrdini,
      ordiniTrend:
        prevTotalOrdini > 0
          ? Math.round(
              ((totalOrdini - prevTotalOrdini) / prevTotalOrdini) * 100
            )
          : null,
      clienti: numClienti,
      dimensioniGruppo: me?.dimensioni_gruppo || 0,
      puntiLivelloSuccessivo: me?.punti_livello_successivo || 0,
    },
    topDownline,
    trend: trend.map((t) => ({
      mese: formatMese(t.mese),
      vpg: t.vpg,
    })),
  });
}
