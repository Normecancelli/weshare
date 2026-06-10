import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // Parametro mese opzionale (default: ultimo disponibile)
  const meseParam = request.nextUrl.searchParams.get("mese");

  // Tutti i mesi disponibili
  const { data: allImports } = await supabase
    .from("imports")
    .select("mese_riferimento")
    .eq("uploaded_by", user.id)
    .eq("status", "completed")
    .order("mese_riferimento", { ascending: false });

  if (!allImports || allImports.length === 0) {
    return NextResponse.json({ empty: true, message: "Nessun dato importato" });
  }

  const mesiDisponibili = allImports.map((i) => i.mese_riferimento);
  const meseCorrente = meseParam && mesiDisponibili.includes(meseParam)
    ? meseParam
    : mesiDisponibili[0];

  // Trova mese precedente
  const idxCorrente = mesiDisponibili.indexOf(meseCorrente);
  const mesePrecedente =
    idxCorrente < mesiDisponibili.length - 1
      ? mesiDisponibili[idxCorrente + 1]
      : null;

  // Dati mese corrente
  const { data: currentData } = await supabase
    .from("monthly_data")
    .select(
      "codice_partner, codice_sponsor, nome, livello, num_ordini_personali, num_ordini_multicarrello, vpp, vp_cliente, dimensioni_gruppo"
    )
    .eq("mese_riferimento", meseCorrente)
    .order("livello", { ascending: true });

  if (!currentData || currentData.length === 0) {
    return NextResponse.json({ empty: true });
  }

  // Dati mese precedente (per confronto)
  let prevMap = new Map<string, { ordini: number; vpp: number }>();
  if (mesePrecedente) {
    const { data: prevData } = await supabase
      .from("monthly_data")
      .select("codice_partner, num_ordini_personali, vpp")
      .eq("mese_riferimento", mesePrecedente);

    if (prevData) {
      for (const r of prevData) {
        prevMap.set(r.codice_partner, {
          ordini: r.num_ordini_personali || 0,
          vpp: r.vpp || 0,
        });
      }
    }
  }

  // Record utente (livello 1) e team
  const me = currentData.find((r) => r.livello === 1);
  const team = currentData.filter((r) => r.livello > 1);

  // Statistiche riepilogative
  const totaleOrdiniPersonali = currentData.reduce(
    (s, r) => s + (r.num_ordini_personali || 0),
    0
  );
  const totaleOrdiniMulticarrello = currentData.reduce(
    (s, r) => s + (r.num_ordini_multicarrello || 0),
    0
  );
  const membriConOrdini = currentData.filter(
    (r) => (r.num_ordini_personali || 0) > 0
  ).length;
  const membriSenzaOrdini = currentData.filter(
    (r) => r.livello > 1 && (r.num_ordini_personali || 0) === 0
  ).length;
  const totaleVpp = currentData.reduce((s, r) => s + (r.vpp || 0), 0);
  const mediaOrdiniPerPersona =
    team.length > 0 ? totaleOrdiniPersonali / team.length : 0;

  // Confronto con mese precedente
  let prevTotOrdini = 0;
  let prevMembriConOrdini = 0;
  if (mesePrecedente) {
    const { data: prevAll } = await supabase
      .from("monthly_data")
      .select("num_ordini_personali, livello")
      .eq("mese_riferimento", mesePrecedente);

    if (prevAll) {
      prevTotOrdini = prevAll.reduce(
        (s, r) => s + (r.num_ordini_personali || 0),
        0
      );
      prevMembriConOrdini = prevAll.filter(
        (r) => (r.num_ordini_personali || 0) > 0
      ).length;
    }
  }

  // Distribuzione ordini per livello
  const distribuzione = new Map<number, { count: number; ordini: number }>();
  for (const r of currentData) {
    const lv = r.livello || 0;
    const curr = distribuzione.get(lv) || { count: 0, ordini: 0 };
    curr.count += 1;
    curr.ordini += r.num_ordini_personali || 0;
    distribuzione.set(lv, curr);
  }

  const distribuzioneArray = Array.from(distribuzione.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([livello, data]) => ({
      livello,
      membri: data.count,
      ordini: data.ordini,
      media: data.count > 0 ? Math.round((data.ordini / data.count) * 10) / 10 : 0,
    }));

  // Lista dettaglio membri con ordini
  const membri = currentData.map((r) => {
    const prev = prevMap.get(r.codice_partner);
    return {
      codice: r.codice_partner,
      codiceSponsor: r.codice_sponsor || null,
      nome: r.nome,
      livello: r.livello || 0,
      ordiniPersonali: r.num_ordini_personali || 0,
      ordiniMulticarrello: r.num_ordini_multicarrello || 0,
      vpp: r.vpp || 0,
      vpCliente: r.vp_cliente || 0,
      dimensioniGruppo: r.dimensioni_gruppo || 0,
      ordiniPrev: prev?.ordini ?? null,
      vppPrev: prev?.vpp ?? null,
    };
  });

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
    mesiDisponibili: mesiDisponibili.map((m) => ({
      value: m,
      label: formatMese(m),
    })),
    stats: {
      totaleOrdini: totaleOrdiniPersonali,
      totaleMulticarrello: totaleOrdiniMulticarrello,
      membriConOrdini,
      membriSenzaOrdini,
      totaleTeam: team.length,
      mediaOrdiniPerPersona:
        Math.round(mediaOrdiniPerPersona * 10) / 10,
      totaleVpp,
      ordiniTrend:
        prevTotOrdini > 0
          ? Math.round(
              ((totaleOrdiniPersonali - prevTotOrdini) / prevTotOrdini) * 100
            )
          : null,
      membriAttiviTrend: prevMembriConOrdini > 0
        ? membriConOrdini - prevMembriConOrdini
        : null,
      mioOrdini: me?.num_ordini_personali || 0,
      mioVpp: me?.vpp || 0,
    },
    distribuzione: distribuzioneArray,
    membri,
  });
}
