import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseAmwayExcel, parseNumericValue } from "@/lib/import/parser";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Verifica autenticazione
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    // Leggi il file dal form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Nessun file caricato" },
        { status: 400 }
      );
    }

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Formato file non supportato. Usa .xlsx" },
        { status: 400 }
      );
    }

    // Carica i mapping colonne dal DB
    const { data: mappings, error: mappingsError } = await supabase
      .from("column_mappings")
      .select("header_amway, campo_interno, obbligatorio")
      .eq("attivo", true);

    if (mappingsError || !mappings) {
      return NextResponse.json(
        { error: "Impossibile caricare i mapping colonne" },
        { status: 500 }
      );
    }

    // Parsa il file Excel
    const buffer = await file.arrayBuffer();
    const parsed = parseAmwayExcel(buffer, mappings);

    // Verifica se esiste già un import per questo mese
    const { data: existing } = await supabase
      .from("imports")
      .select("id")
      .eq("uploaded_by", user.id)
      .eq("mese_riferimento", parsed.meseRiferimento)
      .single();

    // Se esiste, elimina i dati vecchi
    if (existing) {
      const { error: delDataErr } = await supabase
        .from("monthly_data")
        .delete()
        .eq("import_id", existing.id);
      if (delDataErr) console.error("[DELETE monthly_data]", delDataErr.message);

      const { error: delImportErr } = await supabase
        .from("imports")
        .delete()
        .eq("id", existing.id);
      if (delImportErr) console.error("[DELETE imports]", delImportErr.message);
    }

    // Crea record import
    const { data: importRecord, error: importError } = await supabase
      .from("imports")
      .insert({
        uploaded_by: user.id,
        mese_riferimento: parsed.meseRiferimento,
        filename: file.name,
        sheet_name: parsed.sheetName,
        total_rows: parsed.totalRows,
        status: "processing",
        column_mapping: mappings,
      })
      .select("id")
      .single();

    if (importError || !importRecord) {
      return NextResponse.json(
        { error: `Errore creazione import: ${importError?.message}` },
        { status: 500 }
      );
    }

    // Inserisci i dati mensili in batch da 50
    const batchSize = 50;
    for (let i = 0; i < parsed.rows.length; i += batchSize) {
      const batch = parsed.rows.slice(i, i + batchSize).map((row) => ({
        import_id: importRecord.id,
        mese_riferimento: parsed.meseRiferimento,
        livello: row.livello != null ? Number(row.livello) : null,
        codice_partner: String(row.codice_partner || ""),
        codice_sponsor: row.codice_sponsor
          ? String(row.codice_sponsor)
          : null,
        nome: row.nome ? String(row.nome) : null,
        paese: row.paese ? String(row.paese) : null,
        email: row.email ? String(row.email) : null,
        telefono: row.telefono ? String(row.telefono) : null,
        indirizzo: row.indirizzo ? String(row.indirizzo) : null,
        data_ingresso: row.data_ingresso ? String(row.data_ingresso) : null,
        data_rinnovo: row.data_rinnovo ? String(row.data_rinnovo) : null,
        vpg: parseNumericValue(row.vpg),
        vpp: parseNumericValue(row.vpp),
        vp_reso: parseNumericValue(row.vp_reso),
        percentuale_bonus: parseNumericValue(row.percentuale_bonus),
        vvg: parseNumericValue(row.vvg),
        vp_cliente: parseNumericValue(row.vp_cliente),
        vp_rubino: parseNumericValue(row.vp_rubino),
        num_clienti: parseNumericValue(row.num_clienti),
        punti_livello_successivo: parseNumericValue(row.punti_livello_successivo),
        linee_qualificate: parseNumericValue(row.linee_qualificate),
        dimensioni_gruppo: parseNumericValue(row.dimensioni_gruppo),
        num_ordini_personali: parseNumericValue(row.num_ordini_personali),
        num_ordini_multicarrello: parseNumericValue(row.num_ordini_multicarrello),
        sponsorizzazione: parseNumericValue(row.sponsorizzazione),
        vpp_annuali: parseNumericValue(row.vpp_annuali),
        totale_vp_organizzazione: parseNumericValue(row.totale_vp_organizzazione),
      }));

      const { error: insertError } = await supabase
        .from("monthly_data")
        .insert(batch);

      if (insertError) {
        // Aggiorna stato import con errore
        await supabase
          .from("imports")
          .update({
            status: "error",
            error_message: `Errore inserimento riga ${i + 1}: ${insertError.message}`,
          })
          .eq("id", importRecord.id);

        return NextResponse.json(
          { error: `Errore inserimento dati: ${insertError.message}` },
          { status: 500 }
        );
      }
    }

    // Aggiorna stato import a completato
    await supabase
      .from("imports")
      .update({ status: "completed" })
      .eq("id", importRecord.id);

    return NextResponse.json({
      success: true,
      importId: importRecord.id,
      meseRiferimento: parsed.meseRiferimento,
      totalRows: parsed.totalRows,
      sheetName: parsed.sheetName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    console.error("[IMPORT ERROR]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
