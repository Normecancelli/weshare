import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReceiptPdfBuffer, receiptNumber } from "@/lib/receipts/pdf";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: order, error } = await supabase
    .from("client_orders")
    .select("*, customer:customers(id, nome, cognome, telefono, email, indirizzo, citta)")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("client_order_items")
    .select("*, product:products(id, codice_amway, descrizione, contenuto, categoria)")
    .eq("order_id", id);

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("nome, codice_amway, telefono")
    .eq("id", user.id)
    .single();

  const pdfBuffer = await buildReceiptPdfBuffer(
    { ...order, items: items || [] },
    {
      nome: profile?.nome || "",
      codice_amway: profile?.codice_amway || null,
      telefono: profile?.telefono || null,
    }
  );

  // Content-Disposition è un header HTTP: deve restare ByteString/Latin1,
  // niente em-dash o altri caratteri non-ASCII (es. "BOZZA — ..." crasha
  // NextResponse). receiptNumber() resta libero per il testo nel PDF.
  const filenameId = receiptNumber(order)
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .replace(/\s+/g, "-") || "bozza";

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ricevuta-${filenameId}.pdf"`,
    },
  });
}
