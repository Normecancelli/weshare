# Stock personale (magazzino) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ogni partner WeShare può tenere una scorta personale di prodotti ("Stock") caricata tramite ordini a se stesso, usarla per soddisfare ordini clienti urgenti (con decremento automatico), e vedere la quantità disponibile mentre crea un ordine.

**Architecture:** Nuova tabella `magazzino_items` (un numero per partner+prodotto, niente storico movimenti). Un cliente fittizio "Uso personale" per partner riusa il flusso ordini esistente per caricare Stock. Due colonne nuove su `client_order_items` (`destinazione_uso`, `magazzino_movimentato`) pilotano il movimento di Stock, che avviene sempre nello stesso punto già esistente per la numerazione ricevute: `PUT /api/client-orders/[id]` alla transizione di stato. Il raggruppamento verso Amway esclude le righe soddisfatte da Stock.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), TypeScript, Tailwind. **Nessuna suite di test automatica in questo progetto** (confermato: `package.json` ha solo `dev`/`build`/`start`/`lint`) — ogni task termina con una verifica manuale via browser o via query di sola lettura, non con `pytest`/`jest`. Non introdurre un test runner: fuori scope, non richiesto.

**Spec:** `docs/superpowers/specs/2026-09-01-stock-personale-design.md`

## Global Constraints

- Nessuna scrittura diretta sul DB di produzione: ogni migration va scritta su file e applicata dall'utente via SQL Editor Supabase (`https://supabase.com/dashboard/project/ietxuhkkahnvcbchfspt/sql/new`), mai eseguita dall'agente.
- RLS: stesso pattern `partner_id = auth.uid()` già usato per `customers`/`client_orders` — mai `USING (true)` su dati non condivisi (vedi migration `023_fix_products_write_rls.sql` per il motivo).
- Verificare `npx tsc --noEmit` e `npx eslint .` dopo ogni task — il baseline noto è **21 errori pre-esistenti** (`react-hooks/set-state-in-effect`), nessun nuovo errore ammesso.
- Terminologia UI: "Stock" (non "Magazzino") in ogni testo visibile all'utente — la tabella/route restano in italiano (`magazzino_items`, `/magazzino`), solo l'etichetta UI è "Stock" (stessa convenzione già usata per `/presentazioni` → "Speech Audio").

---

## Task 1: Migration — schema Stock

**Files:**
- Create: `supabase/migrations/024_stock_personale.sql`

**Interfaces:**
- Produces: tabella `magazzino_items(id, partner_id, product_id, quantita, updated_at)`, colonna `customers.is_interno BOOLEAN`, colonne `client_order_items.destinazione_uso TEXT` e `client_order_items.magazzino_movimentato BOOLEAN`.

- [ ] **Step 1: Scrivi la migration**

```sql
-- supabase/migrations/024_stock_personale.sql
--
-- Stock personale: ogni partner può tenere una scorta di prodotti a casa
-- propria per consegne urgenti. Vedi docs/superpowers/specs/2026-09-01-stock-personale-design.md

CREATE TABLE magazzino_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantita INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, product_id)
);

CREATE INDEX idx_magazzino_items_partner ON magazzino_items(partner_id);

ALTER TABLE magazzino_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "magazzino_items_own" ON magazzino_items
  FOR ALL TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());

CREATE TRIGGER magazzino_items_updated_at
  BEFORE UPDATE ON magazzino_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Cliente fittizio "Uso personale": riusa il flusso ordini esistente per
-- caricare/consumare Stock senza un cliente reale dietro.
ALTER TABLE customers ADD COLUMN is_interno BOOLEAN NOT NULL DEFAULT FALSE;

-- destinazione_uso: valorizzata solo sugli ordini al cliente is_interno.
-- 'magazzino' = questo pezzo va ad aumentare lo Stock; 'personale' = consumo
-- proprio, nessun effetto su Stock.
ALTER TABLE client_order_items
  ADD COLUMN destinazione_uso TEXT CHECK (destinazione_uso IN ('magazzino', 'personale'));

-- Flag di idempotenza: true quando lo Stock è già stato mosso per questa
-- riga, per evitare doppio conteggio su conferma/riporta-a-bozza ripetuti.
ALTER TABLE client_order_items
  ADD COLUMN magazzino_movimentato BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 2: Committa**

```bash
git add supabase/migrations/024_stock_personale.sql
git commit -m "Migration: schema Stock personale (magazzino_items, is_interno, destinazione_uso)"
```

- [ ] **Step 3: Applica in prod**

Chiedi all'utente di aprire `https://supabase.com/dashboard/project/ietxuhkkahnvcbchfspt/sql/new`, incollare il contenuto del file, eseguire.

- [ ] **Step 4: Verifica (sola lettura)**

Con uno script Node temporaneo (creato ed eliminato subito dopo, come già fatto altrove in questo progetto) usando `@supabase/supabase-js` + `SUPABASE_SERVICE_ROLE_KEY` da `.env.local`:

```js
const { error: e1 } = await supabase.from("magazzino_items").select("*").limit(1);
console.log("magazzino_items:", e1 ? e1.message : "OK");
const { data } = await supabase.from("customers").select("is_interno").limit(1);
console.log("customers.is_interno:", data);
```

Expected: nessun errore, `is_interno` presente nella riga.

---

## Task 2: Tipi TypeScript

**Files:**
- Modify: `src/lib/types/orders.ts`

**Interfaces:**
- Consumes: nessuna (solo tipi).
- Produces: `Customer.is_interno: boolean`, `DestinazioneUso` type, `OrderItem.destinazione_uso: DestinazioneUso | null`, `OrderItem.magazzino_movimentato: boolean`.

- [ ] **Step 1: Estendi `Customer`**

In `src/lib/types/orders.ts`, modifica l'interfaccia esistente (riga ~19-30):

```typescript
export interface Customer {
  id: string;
  partner_id: string;
  nome: string;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  indirizzo: string | null;
  citta: string | null;
  note: string | null;
  created_at: string;
  is_interno: boolean;
}
```

- [ ] **Step 2: Aggiungi `DestinazioneUso` ed estendi `OrderItem`**

Subito dopo `export type ItemSource = "amway" | "magazzino";` (riga ~43):

```typescript
export type DestinazioneUso = "magazzino" | "personale";
```

Nell'interfaccia `OrderItem` (riga ~74-86), aggiungi due campi dopo `fonte: ItemSource;`:

```typescript
export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantita: number;
  prezzo_unitario_cliente: number;
  prezzo_unitario_partner: number;
  punti_vp: number;
  provvigione: number;
  fonte: ItemSource;
  destinazione_uso: DestinazioneUso | null;
  magazzino_movimentato: boolean;
  note: string | null;
  // Joined fields
  product?: Product;
}
```

- [ ] **Step 3: Verifica**

```bash
npx tsc --noEmit
```

Expected: nessun nuovo errore (i campi sono opzionali/nuovi, non rompono usi esistenti).

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/orders.ts
git commit -m "Tipi: Customer.is_interno, OrderItem.destinazione_uso/magazzino_movimentato"
```

---

## Task 3: API + pagina Stock (sola lettura)

**Files:**
- Create: `src/app/api/magazzino/route.ts`
- Create: `src/lib/types/magazzino.ts`
- Create: `src/app/(dashboard)/magazzino/page.tsx`
- Modify: `src/components/sidebar.tsx`

**Interfaces:**
- Consumes: `Product` type da `@/lib/types/orders`.
- Produces: `MagazzinoItem` type, `GET /api/magazzino` → `{ items: MagazzinoItem[] }`.

- [ ] **Step 1: Tipo `MagazzinoItem`**

```typescript
// src/lib/types/magazzino.ts
import type { Product } from "@/lib/types/orders";

export interface MagazzinoItem {
  id: string;
  partner_id: string;
  product_id: string;
  quantita: number;
  updated_at: string;
  product?: Product;
}
```

- [ ] **Step 2: Endpoint `GET /api/magazzino`**

```typescript
// src/app/api/magazzino/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data, error } = await supabase
    .from("magazzino_items")
    .select("*, product:products(id, codice_amway, descrizione, contenuto, categoria, image_url)")
    .eq("partner_id", user.id)
    .gt("quantita", 0)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data || [] });
}
```

- [ ] **Step 3: Pagina `/magazzino`**

```tsx
// src/app/(dashboard)/magazzino/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Warehouse } from "lucide-react";
import type { MagazzinoItem } from "@/lib/types/magazzino";

export default function MagazzinoPage() {
  const [items, setItems] = useState<MagazzinoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/magazzino")
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-text-secondary text-sm">Caricamento…</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Warehouse size={22} strokeWidth={1.75} className="text-accent" />
        <h1 className="text-xl font-bold text-text-primary">Stock</h1>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-text-secondary py-8 text-center">
          Nessun prodotto in Stock. Carica Stock creando un ordine per uso personale.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-bg-card border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm text-text-primary">{item.product?.descrizione}</p>
                <p className="text-xs text-text-secondary">cod. {item.product?.codice_amway}</p>
              </div>
              <span className="text-lg font-bold text-accent">{item.quantita}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Voce sidebar**

In `src/components/sidebar.tsx`, aggiungi `Warehouse` all'import lucide-react esistente (riga ~5-22, insieme a `Presentation`... verifica che sia già stato sostituito da `Mic` in una sessione precedente — aggiungi `Warehouse` alla lista):

```typescript
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Contact,
  Network,
  Receipt,
  ShoppingCart,
  Package,
  Upload,
  Calendar,
  Wallet,
  Target,
  GraduationCap,
  Mic,
  Warehouse,
  Settings,
  LogOut,
  X,
  type LucideIcon,
} from "lucide-react";
```

Nella sezione "Attività" (riga ~57-63), aggiungi la voce dopo "Prodotti":

```typescript
  {
    label: "Attività",
    items: [
      { name: "Fatturati", icon: Receipt, href: "/ordini" },
      { name: "Ordini Clienti", icon: ShoppingCart, href: "/ordini-clienti" },
      { name: "Prodotti", icon: Package, href: "/prodotti" },
      { name: "Stock", icon: Warehouse, href: "/magazzino" },
      { name: "Importa dati", icon: Upload, href: "/import" },
    ],
  },
```

- [ ] **Step 5: Verifica**

```bash
npx tsc --noEmit
npx eslint src/app/api/magazzino/route.ts "src/app/(dashboard)/magazzino/page.tsx" src/components/sidebar.tsx src/lib/types/magazzino.ts
```

Poi in browser (locale o dopo deploy): apri `/magazzino`, verifica che carichi (lista vuota, dato che nessun dato esiste ancora) e che la voce "Stock" compaia in sidebar con icona magazzino.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/magazzino/route.ts src/lib/types/magazzino.ts "src/app/(dashboard)/magazzino/page.tsx" src/components/sidebar.tsx
git commit -m "Aggiunge pagina Stock (sola lettura) e voce sidebar"
```

---

## Task 4: Cliente fittizio "Uso personale"

**Files:**
- Create: `src/app/api/customers/uso-personale/route.ts`
- Modify: `src/app/api/customers/route.ts`

**Interfaces:**
- Consumes: `Customer` type.
- Produces: `POST /api/customers/uso-personale` → `{ customer: Customer }` (get-or-create, idempotente).

- [ ] **Step 1: Endpoint get-or-create**

```typescript
// src/app/api/customers/uso-personale/route.ts
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
```

- [ ] **Step 2: Escludi `is_interno` dalla lista clienti normale**

In `src/app/api/customers/route.ts`, modifica la query GET esistente (riga ~17-21) aggiungendo il filtro:

```typescript
  let query = supabase
    .from("customers")
    .select("*")
    .eq("partner_id", user.id)
    .eq("is_interno", false)
    .order("nome", { ascending: true });
```

- [ ] **Step 3: Verifica**

```bash
npx tsc --noEmit
npx eslint src/app/api/customers/uso-personale/route.ts src/app/api/customers/route.ts
```

Poi via browser (autenticato, es. con la console del sito o un piccolo test manuale): chiama due volte `POST /api/customers/uso-personale` — la seconda deve ritornare lo stesso `id` della prima (non crearne un secondo). Verifica poi che `GET /api/customers` (usato da "I miei Clienti" e "Nuovo Ordine") non includa più quella riga.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/customers/uso-personale/route.ts src/app/api/customers/route.ts
git commit -m "Cliente fittizio 'Uso personale' (get-or-create), escluso dalle liste clienti normali"
```

---

## Task 5: Entry point "Ordine per uso personale"

**Files:**
- Modify: `src/app/(dashboard)/ordini-clienti/nuovo/page.tsx`

**Interfaces:**
- Consumes: `POST /api/customers/uso-personale` (Task 4).
- Produces: stato locale `isPersonalOrder: boolean` — consumato dai Task 6/7 per mostrare i controlli `destinazione_uso` invece di `fonte`.

- [ ] **Step 1: Stato e handler**

In `src/app/(dashboard)/ordini-clienti/nuovo/page.tsx`, aggiungi lo stato dopo `const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);` (riga ~21):

```typescript
  const [isPersonalOrder, setIsPersonalOrder] = useState(false);
```

Aggiungi l'handler dopo `handleQuickAddCustomer` (dopo riga ~136):

```typescript
  async function handleUsoPersonale() {
    const res = await fetch("/api/customers/uso-personale", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setSelectedCustomer(data.customer);
      setIsPersonalOrder(true);
      setShowCustomerList(false);
    }
  }
```

- [ ] **Step 2: Bottone nella sezione cliente**

Nella sezione "Cliente" (cerca `{selectedCustomer ? (` intorno a riga ~172), nel ramo `else` dove oggi c'è la ricerca cliente normale, aggiungi il bottone prima o dopo il campo di ricerca esistente:

```tsx
          <button
            type="button"
            onClick={handleUsoPersonale}
            className="w-full mb-2 text-left px-4 py-2.5 rounded-xl text-sm font-medium border border-dashed border-border text-text-secondary hover:bg-bg-section transition-colors"
          >
            📦 Ordine per uso personale (carica Stock)
          </button>
```

(Se il ramo `else` non ha un blocco unico facilmente identificabile, inserisci il bottone subito prima del componente di ricerca cliente esistente in quel blocco — resta funzionalmente equivalente ovunque compaia entro la sezione "Cliente".)

- [ ] **Step 3: Verifica manuale**

Avvia `npm run dev`, vai su `/ordini-clienti/nuovo`, clicca "Ordine per uso personale" — verifica che il cliente selezionato diventi "Uso personale" e che il resto del form (prodotti, note) resti invariato.

- [ ] **Step 4: Verifica statica**

```bash
npx tsc --noEmit
npx eslint "src/app/(dashboard)/ordini-clienti/nuovo/page.tsx"
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/ordini-clienti/nuovo/page.tsx"
git commit -m "Entry point 'Ordine per uso personale' in Nuovo Ordine"
```

---

## Task 6: Salvataggio `fonte`/`destinazione_uso` sugli item

**Files:**
- Modify: `src/app/api/client-orders/route.ts`
- Modify: `src/app/api/client-orders/add-item/route.ts`
- Modify: `src/app/api/client-orders/[id]/items/[itemId]/route.ts`

**Interfaces:**
- Consumes: `DestinazioneUso` type (Task 2).
- Produces: `client_order_items.fonte`/`destinazione_uso` scrivibili via API (non più hardcoded 'amway'), `PATCH .../items/[itemId]` accetta `{ fonte?, destinazione_uso? }` oltre a `{ quantita? }`.

- [ ] **Step 1: `POST /api/client-orders` accetta fonte/destinazione_uso per item**

In `src/app/api/client-orders/route.ts`, modifica la costruzione di `orderItems` (riga ~130-149):

```typescript
    const orderItems = items.map(
      (item: { product_id: string; quantita: number; note?: string; fonte?: "amway" | "magazzino"; destinazione_uso?: "magazzino" | "personale" }) => {
        const product = productMap.get(item.product_id)!;
        const qty = item.quantita || 1;

        totaleCliente += product.prezzo_cliente * qty;
        totalePartner += product.prezzo_partner * qty;
        totaleVp += product.punti_vp * qty;
        totaleProvvigione += product.provvigione * qty;

        return {
          product_id: item.product_id,
          quantita: qty,
          prezzo_unitario_cliente: product.prezzo_cliente,
          prezzo_unitario_partner: product.prezzo_partner,
          punti_vp: product.punti_vp,
          provvigione: product.provvigione,
          fonte: item.fonte || "amway",
          destinazione_uso: item.destinazione_uso || null,
          note: item.note || null,
        };
      }
    );
```

- [ ] **Step 2: `add-item` route accetta fonte opzionale**

In `src/app/api/client-orders/add-item/route.ts`, sostituisci le due occorrenze hardcoded `fonte: "amway"` (righe ~101 e ~139) leggendo dal body:

```typescript
  const { customer_id, product_id } = body;
  const quantita = Math.max(1, Math.floor(body.quantita ?? 1));
  const fonte = body.fonte === "magazzino" ? "magazzino" : "amway";
```

(aggiungi questa riga subito dopo la dichiarazione di `quantita`, poi sostituisci entrambi `fonte: "amway",` con `fonte,` nei due blocchi insert esistenti).

- [ ] **Step 3: `PATCH .../items/[itemId]` accetta fonte/destinazione_uso**

In `src/app/api/client-orders/[id]/items/[itemId]/route.ts`, la route oggi accetta solo `quantita` e permette la modifica in stati `["bozza", "in_gruppo"]`. `fonte`/`destinazione_uso` devono essere modificabili **solo in bozza** (vincolo più stretto, vedi spec). Sostituisci il blocco body/validazione (righe ~46-64):

```typescript
  let body: { quantita?: number; fonte?: string; destinazione_uso?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.quantita !== undefined) {
    const quantita = Math.floor(body.quantita);
    if (quantita < 1) {
      return NextResponse.json({ error: "La quantità deve essere almeno 1" }, { status: 400 });
    }
    updates.quantita = quantita;
  }

  if (body.fonte !== undefined || body.destinazione_uso !== undefined) {
    if (order.stato !== "bozza") {
      return NextResponse.json(
        { error: "Fonte/destinazione modificabili solo mentre l'ordine è in bozza" },
        { status: 409 },
      );
    }
    if (body.fonte !== undefined) {
      if (!["amway", "magazzino"].includes(body.fonte)) {
        return NextResponse.json({ error: "Fonte non valida" }, { status: 400 });
      }
      updates.fonte = body.fonte;
    }
    if (body.destinazione_uso !== undefined) {
      if (body.destinazione_uso !== null && !["magazzino", "personale"].includes(body.destinazione_uso)) {
        return NextResponse.json({ error: "Destinazione non valida" }, { status: 400 });
      }
      updates.destinazione_uso = body.destinazione_uso;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 });
  }

  const { error } = await supabase
    .from("client_order_items")
    .update(updates)
    .eq("id", itemId)
    .eq("order_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recomputeOrderTotals(supabase, id);
```

Il resto della funzione (calcolo `warning` VP e `return`) resta invariato.

- [ ] **Step 4: Verifica**

```bash
npx tsc --noEmit
npx eslint src/app/api/client-orders/route.ts src/app/api/client-orders/add-item/route.ts "src/app/api/client-orders/[id]/items/[itemId]/route.ts"
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/client-orders/route.ts src/app/api/client-orders/add-item/route.ts "src/app/api/client-orders/[id]/items/[itemId]/route.ts"
git commit -m "API: fonte/destinazione_uso scrivibili sugli item ordine (non più hardcoded)"
```

---

## Task 7: UI — Stock nella ricerca prodotto e sulla riga articolo

**Files:**
- Modify: `src/components/ui/product-search.tsx`
- Modify: `src/app/(dashboard)/ordini-clienti/nuovo/page.tsx`
- Modify: `src/app/(dashboard)/ordini-clienti/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/magazzino` (Task 3), `isPersonalOrder` (Task 5), `PATCH .../items/[itemId]` con `fonte`/`destinazione_uso` (Task 6).
- Produces: `ProductSearch` accetta un nuovo prop `stockMap?: Record<string, number>`.

- [ ] **Step 1: `ProductSearch` mostra "Stock: N"**

In `src/components/ui/product-search.tsx`, aggiungi il prop all'interfaccia (riga ~5-9):

```typescript
interface ProductSearchProps {
  products: Product[];
  onSelect: (product: Product) => void;
  placeholder?: string;
  stockMap?: Record<string, number>;
}

export function ProductSearch({
  products,
  onSelect,
  placeholder = "Cerca per nome o codice...",
  stockMap = {},
}: ProductSearchProps) {
```

Nel rendering di ogni risultato (dentro `.map((product, i) => (`, riga ~106-127), aggiungi l'etichetta sotto il codice prodotto:

```tsx
              <div>
                <div className="font-semibold text-sm text-text-primary">
                  {product.descrizione}
                </div>
                <div className="text-xs text-text-secondary">
                  cod. {product.codice_amway}
                  {product.contenuto && ` · ${product.contenuto}`}
                </div>
                {stockMap[product.id] > 0 && (
                  <div className="text-xs text-accent font-semibold">
                    Stock: {stockMap[product.id]}
                  </div>
                )}
              </div>
```

- [ ] **Step 2: Fetch stock in "Nuovo Ordine"**

In `src/app/(dashboard)/ordini-clienti/nuovo/page.tsx`, estendi il `Promise.all` iniziale (riga ~32-39) per includere lo Stock:

```typescript
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/magazzino").then((r) => r.json()),
    ]).then(([custData, prodData, magData]) => {
      setCustomers(custData.customers || []);
      setProducts(prodData.products || []);
      const map: Record<string, number> = {};
      for (const item of magData.items || []) map[item.product_id] = item.quantita;
      setStockMap(map);
      setLoading(false);
    });
  }, []);
```

(aggiungi la dichiarazione `stockMap` accanto agli altri `useState` esistenti, riga ~14-18, e passa `stockMap={stockMap}` al componente `<ProductSearch />` usato più sotto nel JSX).

- [ ] **Step 3: Toggle `destinazione_uso`/`fonte` sulla riga articolo (Nuovo Ordine)**

Nella struttura `CartItem` (riga ~8-11), aggiungi i due campi opzionali:

```typescript
interface CartItem {
  product: Product;
  quantita: number;
  fonte: "amway" | "magazzino";
  destinazione_uso: "magazzino" | "personale" | null;
}
```

In `addProduct` (riga ~60-71), inizializza i nuovi campi:

```typescript
  function addProduct(product: Product) {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantita: i.quantita + 1 }
            : i
        );
      }
      return [...prev, { product, quantita: 1, fonte: "amway", destinazione_uso: null }];
    });
  }
```

Aggiungi una funzione per cambiare fonte/destinazione dopo `removeItem` (riga ~86-88):

```typescript
  function setItemFonte(productId: string, fonte: "amway" | "magazzino") {
    setItems((prev) => prev.map((i) => (i.product.id === productId ? { ...i, fonte } : i)));
  }

  function setItemDestinazione(productId: string, destinazione_uso: "magazzino" | "personale") {
    setItems((prev) => prev.map((i) => (i.product.id === productId ? { ...i, destinazione_uso } : i)));
  }
```

Includi `fonte`/`destinazione_uso` nel payload di `handleSubmit` (riga ~93-98):

```typescript
        items: items.map((i) => ({
          product_id: i.product.id,
          quantita: i.quantita,
          fonte: i.fonte,
          destinazione_uso: i.destinazione_uso,
        })),
```

Nel JSX della lista carrello (dove oggi si vede lo stepper quantità per ogni `item` di `items`), aggiungi sotto ogni riga:

```tsx
              {isPersonalOrder ? (
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setItemDestinazione(item.product.id, "magazzino")}
                    className={`text-xs px-2 py-1 rounded-lg border ${item.destinazione_uso === "magazzino" ? "border-accent bg-accent-glow text-accent" : "border-border text-text-secondary"}`}
                  >
                    Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemDestinazione(item.product.id, "personale")}
                    className={`text-xs px-2 py-1 rounded-lg border ${item.destinazione_uso === "personale" ? "border-accent bg-accent-glow text-accent" : "border-border text-text-secondary"}`}
                  >
                    Uso personale
                  </button>
                </div>
              ) : stockMap[item.product.id] > 0 ? (
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setItemFonte(item.product.id, "amway")}
                    className={`text-xs px-2 py-1 rounded-lg border ${item.fonte === "amway" ? "border-accent bg-accent-glow text-accent" : "border-border text-text-secondary"}`}
                  >
                    Amway
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemFonte(item.product.id, "magazzino")}
                    className={`text-xs px-2 py-1 rounded-lg border ${item.fonte === "magazzino" ? "border-accent bg-accent-glow text-accent" : "border-border text-text-secondary"}`}
                  >
                    Da Stock ({stockMap[item.product.id]})
                  </button>
                </div>
              ) : null}
```

(inserisci questo blocco JSX subito dopo la riga esistente che mostra nome prodotto/stepper quantità per ogni item, dentro lo stesso contenitore `<div>` per riga).

Aggiungi in `handleSubmit` un blocco di validazione prima del `fetch` (riga ~89-90), che blocca l'invio se un ordine personale ha righe senza `destinazione_uso`:

```typescript
  async function handleSubmit(asBozza: boolean) {
    if (!selectedCustomer || items.length === 0) return;
    if (isPersonalOrder && items.some((i) => !i.destinazione_uso)) {
      alert("Scegli 'Stock' o 'Uso personale' per ogni prodotto prima di salvare.");
      return;
    }

    setSaving(true);
```

- [ ] **Step 4: Stock nella pagina dettaglio ordine**

In `src/app/(dashboard)/ordini-clienti/[id]/page.tsx`, aggiungi lo stato dopo `const [products, setProducts] = useState<Product[]>([]);` (riga 39):

```typescript
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
```

Sostituisci lo `useEffect` che carica i prodotti (righe 64-68) per includere anche lo Stock:

```typescript
  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []));
    fetch("/api/magazzino")
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, number> = {};
        for (const item of d.items || []) map[item.product_id] = item.quantita;
        setStockMap(map);
      });
  }, []);
```

Sul componente `<ProductSearch />` usato in questa pagina (riga ~312), aggiungi la prop `stockMap={stockMap}`.

- [ ] **Step 5: Verifica manuale**

`npm run dev`, vai su "Nuovo Ordine": cerca un prodotto, verifica che compaia "Stock: N" solo se hai già caricato Stock per quel prodotto (sarà sempre 0 finché non completi il Task 8 e carichi davvero Stock — normale a questo punto, verifica solo che il campo non causi errori). Verifica che il flusso "Ordine per uso personale" mostri i bottoni "Stock"/"Uso personale" su ogni riga, e che salvare senza sceglierli per tutte le righe mostri l'alert di blocco.

- [ ] **Step 6: Verifica statica**

```bash
npx tsc --noEmit
npx eslint src/components/ui/product-search.tsx "src/app/(dashboard)/ordini-clienti/nuovo/page.tsx" "src/app/(dashboard)/ordini-clienti/[id]/page.tsx"
```

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/product-search.tsx "src/app/(dashboard)/ordini-clienti/nuovo/page.tsx" "src/app/(dashboard)/ordini-clienti/[id]/page.tsx"
git commit -m "UI: etichetta Stock in ricerca prodotto, scelta Stock/Amway e Stock/Uso-personale sulle righe ordine"
```

---

## Task 8: Movimento Stock alla conferma ordine

**Files:**
- Modify: `src/app/api/client-orders/[id]/route.ts`

**Interfaces:**
- Consumes: `client_order_items.fonte`/`destinazione_uso`/`magazzino_movimentato` (Task 1/6).
- Produces: la conferma di un ordine muove `magazzino_items.quantita` in modo idempotente; blocca la conferma se lo Stock disponibile non basta.

- [ ] **Step 1: Funzione di movimento condivisa**

Aggiungi in cima a `src/app/api/client-orders/[id]/route.ts`, dopo gli import (riga 1-2):

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

// Muove magazzino_items per gli item di un ordine non ancora movimentati.
// direction: "confirm" (prima conferma: incrementa per destinazione_uso
// magazzino, decrementa per fonte magazzino) o "rollback" (annulla il
// movimento fatto in precedenza, verso natura opposta).
async function applyStockDelta(
  supabase: SupabaseClient,
  partnerId: string,
  productId: string,
  delta: number,
) {
  const { data: existing } = await supabase
    .from("magazzino_items")
    .select("id, quantita")
    .eq("partner_id", partnerId)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("magazzino_items")
      .update({ quantita: Math.max(0, existing.quantita + delta) })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("magazzino_items")
      .insert({ partner_id: partnerId, product_id: productId, quantita: Math.max(0, delta) });
  }
}

async function movimentaStock(
  supabase: SupabaseClient,
  partnerId: string,
  orderId: string,
  direction: "confirm" | "rollback",
): Promise<string | null> {
  const { data: allItems } = await supabase
    .from("client_order_items")
    .select("id, product_id, quantita, fonte, destinazione_uso, magazzino_movimentato")
    .eq("order_id", orderId);

  if (!allItems || allItems.length === 0) return null;

  const pending = allItems.filter((item) => {
    const isCarico = item.destinazione_uso === "magazzino";
    const isScarico = item.fonte === "magazzino";
    if (!isCarico && !isScarico) return false;
    return direction === "confirm" ? !item.magazzino_movimentato : item.magazzino_movimentato;
  });

  if (pending.length === 0) return null;

  if (direction === "confirm") {
    // Passata 1: valida TUTTI gli item prima di scrivere qualunque cosa —
    // evita scritture parziali se un item successivo blocca la conferma.
    const scaricoTotals = new Map<string, number>();
    for (const item of pending) {
      if (item.fonte === "magazzino") {
        scaricoTotals.set(item.product_id, (scaricoTotals.get(item.product_id) || 0) + item.quantita);
      }
    }
    for (const [productId, needed] of scaricoTotals) {
      const { data: current } = await supabase
        .from("magazzino_items")
        .select("quantita")
        .eq("partner_id", partnerId)
        .eq("product_id", productId)
        .maybeSingle();
      if (!current || current.quantita < needed) {
        return `Stock insufficiente per un prodotto dell'ordine (disponibili: ${current?.quantita ?? 0}, richiesti: ${needed})`;
      }
    }

    // Passata 2: tutto validato, ora sicuro applicare.
    for (const item of pending) {
      const isCarico = item.destinazione_uso === "magazzino";
      const delta = isCarico ? item.quantita : -item.quantita;
      await applyStockDelta(supabase, partnerId, item.product_id, delta);
      await supabase
        .from("client_order_items")
        .update({ magazzino_movimentato: true })
        .eq("id", item.id);
    }
  } else {
    // Rollback: nessuna validazione necessaria, si torna sempre indietro.
    for (const item of pending) {
      const isCarico = item.destinazione_uso === "magazzino";
      const delta = isCarico ? -item.quantita : item.quantita;
      await applyStockDelta(supabase, partnerId, item.product_id, delta);
      await supabase
        .from("client_order_items")
        .update({ magazzino_movimentato: false })
        .eq("id", item.id);
    }
  }

  return null;
}
```

- [ ] **Step 2: Aggancia al PUT esistente**

In `PUT` (riga ~48-118), subito dopo il blocco esistente che assegna il numero ricevuta (dopo riga 100, prima di `const { data, error } = await supabase.from("client_orders").update(updates)...`), aggiungi:

```typescript
    if (stato === "confermato") {
      const stockError = await movimentaStock(supabase, user.id, id, "confirm");
      if (stockError) {
        return NextResponse.json({ error: stockError }, { status: 409 });
      }
    }

    if (stato === "bozza" || stato === "annullato") {
      await movimentaStock(supabase, user.id, id, "rollback");
    }
```

(Nota: questo blocco va PRIMA dell'update finale di `client_orders`, così se `movimentaStock` blocca per Stock insufficiente, l'ordine non viene affatto confermato — coerente con l'assegnazione del numero ricevuta che invece avviene solo se lo stock-check passa, dato che quel blocco esistente resta sopra e non scrive nulla su `client_orders` di per sé, solo prepara `updates.numero_ricevuta`).

- [ ] **Step 3: Verifica manuale end-to-end**

`npm run dev`, poi in browser:
1. Crea un ordine "per uso personale", un prodotto con `destinazione_uso = Stock`, quantità 3. Conferma. Vai su `/magazzino` — verifica quantità 3.
2. Crea un ordine cliente normale, aggiungi lo stesso prodotto, marca "da Stock", quantità 2. Conferma. Verifica `/magazzino` scesa a 1.
3. Sull'ordine cliente appena confermato, clicca "Riporta a bozza". Verifica `/magazzino` tornata a 3.
4. Prova a marcare "da Stock" una quantità superiore a quella disponibile e confermare — verifica messaggio di errore, ordine resta in bozza.

- [ ] **Step 4: Verifica statica**

```bash
npx tsc --noEmit
npx eslint src/app/api/client-orders/[id]/route.ts
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/client-orders/[id]/route.ts"
git commit -m "Movimento Stock alla conferma/rollback ordine, con blocco se Stock insufficiente"
```

---

## Task 9: Esclusione Stock dal raggruppamento verso Amway

**Files:**
- Modify: `src/app/api/order-groups/route.ts`

**Interfaces:**
- Consumes: `client_order_items.fonte` (esistente).
- Produces: `group_items` non include più righe con `fonte = 'magazzino'`.

- [ ] **Step 1: Filtro sulla query**

In `src/app/api/order-groups/route.ts`, modifica la query che recupera gli item da raggruppare (riga ~115-118):

```typescript
    // Fetch all items from these orders and create group_items
    // (esclude le righe soddisfatte da Stock: non vanno riordinate ad Amway)
    const { data: allItems } = await supabase
      .from("client_order_items")
      .select("id")
      .in("order_id", order_ids)
      .neq("fonte", "magazzino");
```

- [ ] **Step 2: Verifica manuale**

Crea un ordine cliente con due articoli, uno "da Amway" e uno "da Stock" (con Stock disponibile), confermalo, poi raggruppalo (`/ordini-clienti/raggruppa`) — verifica nella pagina "Assegna Carrelli" che compaia solo l'articolo "da Amway", non quello "da Stock".

- [ ] **Step 3: Verifica statica**

```bash
npx tsc --noEmit
npx eslint src/app/api/order-groups/route.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/order-groups/route.ts
git commit -m "Raggruppamento: esclude articoli soddisfatti da Stock dall'invio verso Amway"
```

---

## Verifica finale end-to-end

Dopo tutti i task: `npm run build` deve passare senza errori, `npx eslint .` deve restare a 21 errori (baseline, nessun nuovo). Ripetere il flusso completo del Task 8 Step 3 in produzione dopo il deploy, incluso il caso raggruppamento del Task 9.
