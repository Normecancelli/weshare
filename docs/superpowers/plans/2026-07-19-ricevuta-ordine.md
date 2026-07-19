# Ricevuta ordine (PDF + email + WhatsApp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generare un PDF stile "modulo d'ordine Amway" per un ordine cliente (senza VP/provvigioni), scaricabile, inviabile via email (Resend) o allegabile a mano su WhatsApp.

**Architecture:** Un modulo condiviso `src/lib/receipts/pdf.tsx` costruisce il PDF con `@react-pdf/renderer`. Due nuove API route sotto `/api/client-orders/[id]/receipt` (GET per il download, POST `.../send-email` per l'invio via Resend) riusano lo stesso builder. La pagina ordine (`/ordini-clienti/[id]`) ottiene una nuova sezione "Ricevuta" con 3 azioni.

**Tech Stack:** Next.js 15 App Router (TypeScript), Supabase, `@react-pdf/renderer` (nuova dipendenza), Resend (già presente).

## Global Constraints

- Spec di riferimento: `docs/superpowers/specs/2026-07-19-ricevuta-ordine-design.md`.
- Nessuna suite di test automatica in questo progetto: verifica = `npm run build` + verifica manuale in browser.
- Ricevuta **senza** VP e provvigioni, **senza** sezione P.IVA/SDI/Pec, **senza** subtotale/spese trasporto/contrassegno — un solo importo "Totale da pagare" = `order.totale_cliente`.
- Footer PDF: intestazione esatta **"IL VOSTRO PARTNER AMWAY"** (non "Imprenditore").
- Numero ricevuta: prime 8 caratteri (uppercase, senza trattini) dell'`id` ordine.
- Bottone/sezione "Ricevuta" visibile su **qualsiasi** stato ordine, nessun gating.
- Nuove route API: sempre `supabase.auth.getUser()` prima della logica, ownership check `.eq("partner_id", user.id)` — stesso pattern di `src/app/api/client-orders/[id]/route.ts`.
- Messaggi di stato nella nuova sezione UI: usare `<InlineMessage variant="success|error">` da `src/components/ui/inline-message.tsx`.
- Italian locale in tutte le stringhe utente-facing.
- WhatsApp: mai invio automatico — solo download + apertura `wa.me` con testo precompilato, stesso pattern già usato altrove nel codice (es. `src/app/(dashboard)/clienti/page.tsx`), nessun nuovo helper condiviso cross-modulo.

---

## Task 1: Dipendenza `@react-pdf/renderer` + modulo PDF condiviso

**Files:**
- Modify: `package.json` (via `npm install`)
- Create: `src/lib/receipts/pdf.tsx`

**Interfaces:**
- Produces: `buildReceiptPdfBuffer(order: ClientOrder, partner: { nome: string; codice_amway: string | null; telefono: string | null }): Promise<Buffer>` e `receiptNumber(orderId: string): string` — entrambi usati da Task 2 e Task 3 (garantisce lo stesso numero ricevuta su PDF, filename e oggetto email).
- Consumes: `ClientOrder`, `OrderItem` da `src/lib/types/orders.ts` (esistenti, nessuna modifica).

- [ ] **Step 1: Installa la dipendenza**

Run: `npm install @react-pdf/renderer`
Expected: `package.json` → `dependencies["@react-pdf/renderer"]` aggiunto con la versione risolta da npm.

- [ ] **Step 2: Crea il modulo PDF**

```tsx
// src/lib/receipts/pdf.tsx
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { ClientOrder } from "@/lib/types/orders";

interface PartnerInfo {
  nome: string;
  codice_amway: string | null;
  telefono: string | null;
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  logo: { fontSize: 22, fontWeight: 700 },
  titleBlock: { alignItems: "flex-end" },
  title: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  section: { borderWidth: 1, borderColor: "#999999", padding: 8, marginBottom: 10 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { fontWeight: 700, marginRight: 4 },
  table: { borderWidth: 1, borderColor: "#999999", marginBottom: 10 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cccccc" },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#f0f0f0", borderBottomWidth: 1, borderBottomColor: "#999999" },
  cellHeader: { fontWeight: 700, padding: 4 },
  colCodice: { width: "15%", padding: 4 },
  colQta: { width: "10%", padding: 4 },
  colDescrizione: { width: "55%", padding: 4 },
  colPrezzo: { width: "20%", padding: 4, textAlign: "right" },
  totaleBox: { alignSelf: "flex-end", width: 220, borderWidth: 1, borderColor: "#999999", marginBottom: 24 },
  totaleRow: { flexDirection: "row", justifyContent: "space-between", padding: 6 },
  totaleLabel: { fontWeight: 700 },
  firma: { marginTop: 20, borderTopWidth: 1, borderTopColor: "#999999", width: 200, paddingTop: 4 },
  footer: { marginTop: 24, borderTopWidth: 1, borderTopColor: "#999999", paddingTop: 8 },
  footerTitle: { fontWeight: 700, marginBottom: 4 },
});

export function receiptNumber(orderId: string): string {
  return orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ReceiptDocument({ order, partner }: { order: ClientOrder; partner: PartnerInfo }) {
  const customerName = order.customer
    ? `${order.customer.nome} ${order.customer.cognome || ""}`.trim()
    : "Cliente";
  const items = order.items || [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.logo}>Amway</Text>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>MODULO D&apos;ORDINE — RICEVUTA N. {receiptNumber(order.id)}</Text>
            <Text>Data: {formatDate(order.created_at)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Cliente:</Text>
            <Text>{customerName}</Text>
          </View>
          {order.customer?.indirizzo ? (
            <View style={styles.row}>
              <Text style={styles.label}>Indirizzo:</Text>
              <Text>{order.customer.indirizzo}</Text>
            </View>
          ) : null}
          {order.customer?.citta ? (
            <View style={styles.row}>
              <Text style={styles.label}>Città:</Text>
              <Text>{order.customer.citta}</Text>
            </View>
          ) : null}
          {order.customer?.telefono ? (
            <View style={styles.row}>
              <Text style={styles.label}>Telefono:</Text>
              <Text>{order.customer.telefono}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colCodice, styles.cellHeader]}>Codice</Text>
            <Text style={[styles.colQta, styles.cellHeader]}>Q.tà</Text>
            <Text style={[styles.colDescrizione, styles.cellHeader]}>Descrizione</Text>
            <Text style={[styles.colPrezzo, styles.cellHeader]}>Prezzo (IVA inclusa)</Text>
          </View>
          {items.map((it) => (
            <View key={it.id} style={styles.tableRow}>
              <Text style={styles.colCodice}>{it.product?.codice_amway || "—"}</Text>
              <Text style={styles.colQta}>{it.quantita}</Text>
              <Text style={styles.colDescrizione}>{it.product?.descrizione || "—"}</Text>
              <Text style={styles.colPrezzo}>{"€"}{(it.prezzo_unitario_cliente * it.quantita).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totaleBox}>
          <View style={styles.totaleRow}>
            <Text style={styles.totaleLabel}>Totale da pagare</Text>
            <Text style={styles.totaleLabel}>{"€"}{order.totale_cliente.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.firma}>
          <Text>Firma del cliente</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>IL VOSTRO PARTNER AMWAY</Text>
          <Text>Nome e cognome: {partner.nome}</Text>
          {partner.codice_amway ? <Text>Codice Amway: {partner.codice_amway}</Text> : null}
          {partner.telefono ? <Text>Telefono: {partner.telefono}</Text> : null}
          <Text style={{ marginTop: 8 }}>Grazie per il suo ordine!</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function buildReceiptPdfBuffer(order: ClientOrder, partner: PartnerInfo): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument order={order} partner={partner} />);
}
```

- [ ] **Step 3: Verifica**

Run: `npm run build`
Expected: nessun errore TypeScript (il file è `.tsx`, JSX di `@react-pdf/renderer` compila come qualsiasi altro componente).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/receipts/pdf.tsx
git commit -m "feat(ricevuta): builder PDF ricevuta ordine con @react-pdf/renderer"
```

---

## Task 2: API `GET /api/client-orders/[id]/receipt` (download)

**Files:**
- Create: `src/app/api/client-orders/[id]/receipt/route.ts`

**Interfaces:**
- Consumes: `buildReceiptPdfBuffer()` e `receiptNumber()` da Task 1.
- Produces: `GET /api/client-orders/[id]/receipt` → risponde con `application/pdf`, `Content-Disposition: attachment`. Consumato da Task 4 (bottoni "Scarica PDF" e "WhatsApp").

- [ ] **Step 1: Scrivi la route**

```ts
// src/app/api/client-orders/[id]/receipt/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ricevuta-${receiptId}.pdf"`,
    },
  });
}
```

- [ ] **Step 2: Verifica**

Run: `npm run build`
Expected: nessun errore.

- [ ] **Step 3: Verifica manuale con curl**

Con `npm run dev` attivo e un ordine reale esistente:

```bash
curl -s -o /tmp/ricevuta-test.pdf -w "%{http_code} %{content_type}\n" \
  -b "<cookie di sessione autenticata>" \
  http://localhost:3000/api/client-orders/<order-id>/receipt
```

Expected: `200 application/pdf`, e `/tmp/ricevuta-test.pdf` è un PDF valido apribile (verificare con `file /tmp/ricevuta-test.pdf` → "PDF document"). Se non è possibile ottenere un cookie di sessione da curl in questo ambiente, verificare aprendo l'URL direttamente nel browser mentre si è loggati.

Provare anche con l'id di un ordine di un altro partner (o non esistente): expected `404 {"error":"Ordine non trovato"}`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/client-orders/\[id\]/receipt/route.ts
git commit -m "feat(ricevuta): API download PDF ricevuta ordine"
```

---

## Task 3: API `POST /api/client-orders/[id]/receipt/send-email`

**Files:**
- Create: `src/app/api/client-orders/[id]/receipt/send-email/route.ts`

**Interfaces:**
- Consumes: `buildReceiptPdfBuffer()` e `receiptNumber()` da Task 1.
- Produces: `POST /api/client-orders/[id]/receipt/send-email` → `{ sent: true }` o `{ error: string }`. Consumato da Task 4 (bottone "Invia email").

- [ ] **Step 1: Scrivi la route**

```ts
// src/app/api/client-orders/[id]/receipt/send-email/route.ts
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
```

- [ ] **Step 2: Verifica**

Run: `npm run build`
Expected: nessun errore.

- [ ] **Step 3: Verifica manuale**

Con `npm run dev` attivo e `RESEND_API_KEY` impostata in `.env.local`:

```bash
curl -s -X POST -b "<cookie di sessione autenticata>" \
  http://localhost:3000/api/client-orders/<order-id-con-cliente-con-email>/receipt/send-email
```

Expected: `{"sent":true}`, e l'email arriva davvero alla casella del cliente con il PDF in allegato.

```bash
curl -s -X POST -b "<cookie>" \
  http://localhost:3000/api/client-orders/<order-id-con-cliente-senza-email>/receipt/send-email
```

Expected: `{"error":"Cliente senza email"}`.

Se non è possibile ottenere un cookie di sessione da curl in questo ambiente, verificare tramite il bottone "Invia email" nel browser una volta completato il Task 4 (posticipare questa verifica specifica a fine Task 4 se necessario, annotandolo nel report).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/client-orders/\[id\]/receipt/send-email/route.ts
git commit -m "feat(ricevuta): API invio ricevuta via email con Resend"
```

---

## Task 4: UI — sezione "Ricevuta" in `/ordini-clienti/[id]`

**Files:**
- Modify: `src/app/(dashboard)/ordini-clienti/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/client-orders/[id]/receipt` (Task 2), `POST /api/client-orders/[id]/receipt/send-email` (Task 3), `<InlineMessage variant="...">` da `src/components/ui/inline-message.tsx`.

- [ ] **Step 1: Importa `InlineMessage` e aggiungi stato**

In cima al file, aggiungi l'import:

```ts
import { InlineMessage } from "@/components/ui/inline-message";
```

Subito dopo `const [vpWarning, setVpWarning] = useState<string | null>(null);`, aggiungi:

```ts
  const [sendingEmail, setSendingEmail] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState<{ variant: "success" | "error"; text: string } | null>(null);
```

- [ ] **Step 2: Aggiungi le funzioni di invio**

Subito dopo la funzione `handleDelete`, aggiungi:

```ts
  async function handleSendEmail() {
    setSendingEmail(true);
    setReceiptMessage(null);
    const res = await fetch(`/api/client-orders/${id}/receipt/send-email`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setReceiptMessage({ variant: "success", text: "Email inviata con la ricevuta in allegato." });
    } else {
      setReceiptMessage({ variant: "error", text: data.error || "Errore durante l'invio dell'email" });
    }
    setSendingEmail(false);
  }

  function handleWhatsappClick() {
    if (!order?.customer?.telefono) {
      setReceiptMessage({ variant: "error", text: "Cliente senza numero di telefono" });
      return;
    }
    window.open(`/api/client-orders/${id}/receipt`, "_blank");
    const phone = order.customer.telefono.replace(/\s+/g, "").replace(/^\+/, "");
    const text = encodeURIComponent(
      `Ciao ${order.customer.nome}! Ti invio in allegato la ricevuta del tuo ordine.`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
  }
```

- [ ] **Step 3: Aggiungi la sezione "Ricevuta"**

Subito dopo la sezione "Note" (dopo il suo `</section>` di chiusura, prima del div "Azioni"), aggiungi:

```tsx
      {/* Ricevuta */}
      <section className="bg-bg-card border border-border rounded-2xl p-5 mb-4">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Ricevuta</div>
        {receiptMessage && (
          <div className="mb-3">
            <InlineMessage variant={receiptMessage.variant}>{receiptMessage.text}</InlineMessage>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/client-orders/${id}/receipt`}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-border text-text-primary hover:bg-bg-section transition-all"
          >
            Scarica PDF
          </a>
          <button
            type="button"
            onClick={handleSendEmail}
            disabled={sendingEmail}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-border text-text-primary hover:bg-bg-section transition-all disabled:opacity-50"
          >
            {sendingEmail ? "Invio..." : "Invia email"}
          </button>
          <button
            type="button"
            onClick={handleWhatsappClick}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#25D366] text-white hover:opacity-90 transition-all"
          >
            WhatsApp
          </button>
        </div>
      </section>
```

- [ ] **Step 4: Verifica**

Run: `npm run build`
Expected: nessun errore.

- [ ] **Step 5: Verifica manuale end-to-end**

1. Aprire un ordine qualsiasi in `/ordini-clienti/[id]`, click "Scarica PDF" → verifica che il download parta e il PDF sia corretto (cliente, articoli, totale, footer "IL VOSTRO PARTNER AMWAY").
2. Click "Invia email" su un cliente con email → verifica messaggio di successo e ricezione email reale con allegato.
3. Click "Invia email" su un cliente senza email → verifica `InlineMessage` di errore "Cliente senza email".
4. Click "WhatsApp" su un cliente con telefono → verifica che si aprano due nuove tab (download PDF + `wa.me` con testo precompilato).
5. Click "WhatsApp" su un cliente senza telefono → verifica `InlineMessage` di errore, nessuna tab aperta.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/ordini-clienti/[id]/page.tsx"
git commit -m "feat(ricevuta): sezione UI download/email/WhatsApp in pagina ordine"
```
