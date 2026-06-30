import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRole, isAdminRole } from "@/lib/auth/roles";

async function authorize(
  request: NextRequest,
): Promise<
  | { error: NextResponse }
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Non autenticato" }, { status: 401 }),
    };
  }
  const role = await getUserRole(createAdminClient(), user.id);
  if (!isAdminRole(role)) {
    return {
      error: NextResponse.json(
        { error: "Solo un amministratore può modificare i prodotti" },
        { status: 403 },
      ),
    };
  }
  return { supabase, userId: user.id };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.codice_amway !== undefined)
    updates.codice_amway = String(body.codice_amway).trim();
  if (body.descrizione !== undefined)
    updates.descrizione = String(body.descrizione).trim();
  if (body.categoria !== undefined)
    updates.categoria = body.categoria ? String(body.categoria).trim() : null;
  if (body.contenuto !== undefined)
    updates.contenuto = body.contenuto ? String(body.contenuto).trim() : null;
  if (body.prezzo_cliente !== undefined)
    updates.prezzo_cliente = Number(body.prezzo_cliente) || 0;
  if (body.prezzo_partner !== undefined)
    updates.prezzo_partner = Number(body.prezzo_partner) || 0;
  if (body.provvigione !== undefined)
    updates.provvigione = Number(body.provvigione) || 0;
  if (body.prezzo_unita !== undefined)
    updates.prezzo_unita = body.prezzo_unita
      ? String(body.prezzo_unita).trim()
      : null;
  if (body.punti_vp !== undefined)
    updates.punti_vp = Number(body.punti_vp) || 0;
  if (body.volume_vv !== undefined)
    updates.volume_vv = Number(body.volume_vv) || 0;
  if (body.image_url !== undefined)
    updates.image_url = body.image_url ? String(body.image_url).trim() : null;
  if (body.attivo !== undefined) updates.attivo = Boolean(body.attivo);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Nessun campo da aggiornare" },
      { status: 400 },
    );
  }

  // Se il codice viene cambiato, controlla che non sia già in uso da un altro prodotto
  if (updates.codice_amway) {
    const { data: clash } = await supabase
      .from("products")
      .select("id")
      .eq("codice_amway", updates.codice_amway as string)
      .neq("id", id)
      .maybeSingle();
    if (clash) {
      return NextResponse.json(
        { error: `Codice ${updates.codice_amway} già in uso da un altro prodotto` },
        { status: 409 },
      );
    }
  }

  const { data, error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ product: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  // Se è già usato in ordini storici, non cancellare ma disattivare (preserva storico)
  const { count } = await supabase
    .from("client_order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);

  if ((count || 0) > 0) {
    const { error } = await supabase
      .from("products")
      .update({ attivo: false })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      deactivated: true,
      reason: `Prodotto presente in ${count} ordin${count === 1 ? "e" : "i"}; disattivato invece di eliminato per preservare lo storico.`,
    });
  }

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
