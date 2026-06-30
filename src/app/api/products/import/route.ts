import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePriceListExcel } from "@/lib/import/price-list-parser";
import { getUserRole, isAdminRole } from "@/lib/auth/roles";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const role = await getUserRole(createAdminClient(), user.id);
  if (!isAdminRole(role)) {
    return NextResponse.json(
      {
        error:
          "Solo un amministratore può aggiornare il listino. Contatta il referente WeShare.",
      },
      { status: 403 },
    );
  }

  try {
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

    const buffer = await file.arrayBuffer();
    const parsed = parsePriceListExcel(buffer);

    // Upsert products in batches of 50
    let inserted = 0;
    let updated = 0;
    const allCodes: string[] = [];

    for (let i = 0; i < parsed.products.length; i += 50) {
      const batch = parsed.products.slice(i, i + 50);

      for (const p of batch) {
        allCodes.push(p.codice_amway);

        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("codice_amway", p.codice_amway)
          .single();

        if (existing) {
          await supabase
            .from("products")
            .update({
              descrizione: p.descrizione,
              categoria: p.categoria,
              contenuto: p.contenuto,
              prezzo_cliente: p.prezzo_cliente,
              prezzo_partner: p.prezzo_partner,
              provvigione: p.provvigione,
              prezzo_unita: p.prezzo_unita,
              punti_vp: p.punti_vp,
              volume_vv: p.volume_vv,
              attivo: true,
            })
            .eq("id", existing.id);
          updated++;
        } else {
          const { error: insertErr } = await supabase
            .from("products")
            .insert({
              codice_amway: p.codice_amway,
              descrizione: p.descrizione,
              categoria: p.categoria,
              contenuto: p.contenuto,
              prezzo_cliente: p.prezzo_cliente,
              prezzo_partner: p.prezzo_partner,
              provvigione: p.provvigione,
              prezzo_unita: p.prezzo_unita,
              punti_vp: p.punti_vp,
              volume_vv: p.volume_vv,
              attivo: true,
            });
          if (insertErr) {
            return NextResponse.json(
              { error: `Errore inserimento ${p.codice_amway}: ${insertErr.message}` },
              { status: 500 }
            );
          }
          inserted++;
        }
      }
    }

    // Deactivate products not in the new list (solo se import completo)
    const partial = request.nextUrl.searchParams.get("partial") === "true";
    let deactivated = 0;
    if (!partial) {
      const { data: allProducts } = await supabase
        .from("products")
        .select("id, codice_amway")
        .eq("attivo", true);

      if (allProducts) {
        const newCodes = new Set(allCodes);
        for (const p of allProducts) {
          if (!newCodes.has(p.codice_amway)) {
            await supabase
              .from("products")
              .update({ attivo: false })
              .eq("id", p.id);
            deactivated++;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalProducts: parsed.totalProducts,
      categories: parsed.categories.length,
      inserted,
      updated,
      deactivated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
