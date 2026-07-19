import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { buildReceiptPdfBuffer, receiptNumber } from "@/lib/receipts/pdf";

export async function POST(
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

  if (!order.customer?.email) {
    return NextResponse.json({ error: "Cliente senza email" }, { status: 400 });
  }

  const { data: items } = await supabase
    .from("client_order_items")
    .select("*, product:products(id, codice_amway, descrizione, contenuto, categoria)")
    .eq("order_id", id);

  const { data: profile } = await supabase
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

  const receiptId = receiptNumber(id);
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error: sendError } = await resend.emails.send({
    from: "WeShare <noreply@growset.it>",
    to: order.customer.email,
    subject: `La tua ricevuta d'ordine N. ${receiptId}`,
    html: `<p>Ciao ${order.customer.nome},</p><p>in allegato trovi la ricevuta del tuo ordine.</p><p>Grazie!</p>`,
    attachments: [{ filename: `ricevuta-${receiptId}.pdf`, content: pdfBuffer }],
  });

  if (sendError) {
    return NextResponse.json({ error: sendError.message }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}
