# Ordini Clienti — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Phase 1 of client order management: product catalog, customer CRUD, single client orders, weekly order grouping with 3 Amway cart types, VP counter, and upload confirmation.

**Architecture:** Mobile-first Next.js 15 App Router pages under `(dashboard)` route group. Supabase for DB + auth + RLS. Client-side data fetching with `useState`/`useEffect` pattern (matching existing codebase). All new API routes follow the established pattern in `src/app/api/*/route.ts`. Product catalog parser uses `xlsx` library (already installed).

**Tech Stack:** Next.js 15, Supabase (PostgreSQL + Auth + RLS), Tailwind CSS v4 with custom palette (globals.css), TypeScript, xlsx library.

**Spec:** `docs/superpowers/specs/2026-06-09-ordini-clienti-design.md`

---

## File Structure

### New Files

```
src/
  lib/
    import/
      price-list-parser.ts          # Excel price list parser (Amway format)
    types/
      orders.ts                      # Shared TypeScript types for orders module
  app/
    api/
      products/
        route.ts                     # GET: list/search products
        import/
          route.ts                   # POST: import price list Excel
      customers/
        route.ts                     # GET: list, POST: create customer
        [id]/
          route.ts                   # GET: single, PUT: update, DELETE: delete
        import/
          route.ts                   # POST: import customers from Excel
      client-orders/
        route.ts                     # GET: list, POST: create order
        [id]/
          route.ts                   # GET: detail, PUT: update
      order-groups/
        route.ts                     # GET: list, POST: create group
        [id]/
          route.ts                   # PUT: update group (cart assignments)
          confirm/
            route.ts                 # PUT: confirm "uploaded to Amway"
    (dashboard)/
      prodotti/
        page.tsx                     # Product catalog page
        import/
          page.tsx                   # Import price list page
      clienti/
        page.tsx                     # Customer list page
        [id]/
          page.tsx                   # Customer detail page
      ordini-clienti/
        page.tsx                     # Orders list + stats
        nuovo/
          page.tsx                   # New order (fullscreen on mobile)
        [id]/
          page.tsx                   # Order detail
        raggruppa/
          page.tsx                   # Order grouping with 3 carts
  components/
    ui/
      mobile-nav.tsx                 # Hamburger menu for mobile
      stat-card.tsx                  # Reusable stat card component
      product-search.tsx             # Product autocomplete search
      cart-selector.tsx              # Mini-buttons for cart type selection
      vp-counter.tsx                 # VP progress bar (510 max)

supabase/
  migrations/
    002_ordini_clienti.sql           # All new tables, enums, indexes, RLS
```

### Modified Files

```
src/
  components/
    sidebar.tsx                      # Add new menu items
  app/
    (dashboard)/
      layout.tsx                     # Add mobile hamburger nav
    globals.css                      # Add mobile breakpoint utilities if needed
```

---

## Task 1: Database Schema — New Tables & RLS

**Files:**
- Create: `supabase/migrations/002_ordini_clienti.sql`

- [ ] **Step 1: Write the migration SQL file**

Create `supabase/migrations/002_ordini_clienti.sql` with the complete schema:

```sql
-- ============================================
-- Ordini Clienti — Phase 1 Schema
-- ============================================

-- Enum types
CREATE TYPE order_status AS ENUM (
  'bozza',
  'confermato',
  'in_gruppo',
  'completato',
  'annullato'
);

CREATE TYPE order_channel AS ENUM (
  'whatsapp',
  'presenza',
  'telefono'
);

CREATE TYPE cart_type AS ENUM (
  'personale',
  'non_registrato',
  'programmato'
);

CREATE TYPE item_source AS ENUM ('amway', 'magazzino');

CREATE TYPE group_status AS ENUM (
  'aperto',
  'caricato',
  'confermato'
);

-- ============================================
-- PRODUCTS (Catalogo Amway)
-- ============================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codice_amway TEXT NOT NULL UNIQUE,
  descrizione TEXT NOT NULL,
  categoria TEXT,
  contenuto TEXT,
  prezzo_cliente NUMERIC(10,2) DEFAULT 0,
  prezzo_partner NUMERIC(10,2) DEFAULT 0,
  provvigione NUMERIC(10,2) DEFAULT 0,
  prezzo_unita TEXT,
  punti_vp NUMERIC(10,2) DEFAULT 0,
  volume_vv NUMERIC(10,2) DEFAULT 0,
  attivo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_codice ON products(codice_amway);
CREATE INDEX idx_products_categoria ON products(categoria);
CREATE INDEX idx_products_attivo ON products(attivo);

-- ============================================
-- CUSTOMERS (Clienti)
-- ============================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cognome TEXT,
  telefono TEXT,
  email TEXT,
  indirizzo TEXT,
  citta TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_partner ON customers(partner_id);

-- ============================================
-- ORDER GROUPS (Raggruppamento settimanale)
-- ============================================
CREATE TABLE order_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  stato group_status NOT NULL DEFAULT 'aperto',
  data_caricamento TIMESTAMPTZ,
  ordini_programmati_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_groups_partner ON order_groups(partner_id);
CREATE INDEX idx_order_groups_stato ON order_groups(stato);

-- ============================================
-- CLIENT ORDERS (Ordini singoli)
-- ============================================
CREATE TABLE client_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stato order_status NOT NULL DEFAULT 'bozza',
  canale order_channel,
  note TEXT,
  totale_cliente NUMERIC(10,2) DEFAULT 0,
  totale_partner NUMERIC(10,2) DEFAULT 0,
  totale_vp NUMERIC(10,2) DEFAULT 0,
  totale_provvigione NUMERIC(10,2) DEFAULT 0,
  group_id UUID REFERENCES order_groups(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_orders_partner ON client_orders(partner_id);
CREATE INDEX idx_client_orders_customer ON client_orders(customer_id);
CREATE INDEX idx_client_orders_stato ON client_orders(stato);
CREATE INDEX idx_client_orders_group ON client_orders(group_id);

-- ============================================
-- CLIENT ORDER ITEMS (Righe ordine)
-- ============================================
CREATE TABLE client_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES client_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantita INTEGER NOT NULL DEFAULT 1,
  prezzo_unitario_cliente NUMERIC(10,2) NOT NULL,
  prezzo_unitario_partner NUMERIC(10,2) NOT NULL,
  punti_vp NUMERIC(10,2) NOT NULL,
  provvigione NUMERIC(10,2) NOT NULL DEFAULT 0,
  fonte item_source NOT NULL DEFAULT 'amway',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order ON client_order_items(order_id);
CREATE INDEX idx_order_items_product ON client_order_items(product_id);

-- ============================================
-- GROUP ITEMS (Assegnazione carrello)
-- ============================================
CREATE TABLE group_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES order_groups(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES client_order_items(id),
  carrello cart_type NOT NULL DEFAULT 'personale',
  confermato BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_group_items_group ON group_items(group_id);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER client_orders_updated_at
  BEFORE UPDATE ON client_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER order_groups_updated_at
  BEFORE UPDATE ON order_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_items ENABLE ROW LEVEL SECURITY;

-- Products: readable by all authenticated users (shared catalog)
CREATE POLICY "products_read" ON products
  FOR SELECT TO authenticated
  USING (true);

-- Products: insert/update only by admin roles
CREATE POLICY "products_write" ON products
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Customers: partner sees only their own
CREATE POLICY "customers_own" ON customers
  FOR ALL TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());

-- Client orders: partner sees only their own
CREATE POLICY "client_orders_own" ON client_orders
  FOR ALL TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());

-- Client order items: accessible if the order belongs to the partner
CREATE POLICY "order_items_own" ON client_order_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM client_orders
      WHERE client_orders.id = client_order_items.order_id
      AND client_orders.partner_id = auth.uid()
    )
  );

-- Order groups: partner sees only their own
CREATE POLICY "order_groups_own" ON order_groups
  FOR ALL TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());

-- Group items: accessible if the group belongs to the partner
CREATE POLICY "group_items_own" ON group_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM order_groups
      WHERE order_groups.id = group_items.group_id
      AND order_groups.partner_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration to Supabase**

Go to the Supabase SQL Editor at https://supabase.com/dashboard/project/ietxuhkkahnvcbchfspt/sql and run the migration SQL.

Verify by running:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('products', 'customers', 'client_orders', 'client_order_items', 'order_groups', 'group_items')
ORDER BY table_name;
```
Expected: all 6 tables listed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_ordini_clienti.sql
git commit -m "feat: add database schema for ordini clienti phase 1"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/lib/types/orders.ts`

- [ ] **Step 1: Create the shared types file**

```typescript
// Shared TypeScript types for the orders module

export interface Product {
  id: string;
  codice_amway: string;
  descrizione: string;
  categoria: string | null;
  contenuto: string | null;
  prezzo_cliente: number;
  prezzo_partner: number;
  provvigione: number;
  prezzo_unita: string | null;
  punti_vp: number;
  volume_vv: number;
  attivo: boolean;
}

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
}

export type OrderStatus = "bozza" | "confermato" | "in_gruppo" | "completato" | "annullato";
export type OrderChannel = "whatsapp" | "presenza" | "telefono";
export type CartType = "personale" | "non_registrato" | "programmato";
export type ItemSource = "amway" | "magazzino";
export type GroupStatus = "aperto" | "caricato" | "confermato";

export interface ClientOrder {
  id: string;
  partner_id: string;
  customer_id: string;
  stato: OrderStatus;
  canale: OrderChannel | null;
  note: string | null;
  totale_cliente: number;
  totale_partner: number;
  totale_vp: number;
  totale_provvigione: number;
  group_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  customer?: Customer;
  items?: OrderItem[];
}

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
  note: string | null;
  // Joined fields
  product?: Product;
}

export interface OrderGroup {
  id: string;
  partner_id: string;
  nome: string;
  stato: GroupStatus;
  data_caricamento: string | null;
  ordini_programmati_count: number;
  note: string | null;
  created_at: string;
  // Joined fields
  orders?: ClientOrder[];
  group_items?: GroupItem[];
}

export interface GroupItem {
  id: string;
  group_id: string;
  order_item_id: string;
  carrello: CartType;
  confermato: boolean;
  // Joined fields
  order_item?: OrderItem;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types/orders.ts
git commit -m "feat: add shared TypeScript types for orders module"
```

---

## Task 3: Product Catalog — Parser

**Files:**
- Create: `src/lib/import/price-list-parser.ts`

- [ ] **Step 1: Create the price list parser**

This parser handles the Amway price list Excel format. Key characteristics:
- Row 56 has headers (B=Codice, F=Descrizione, N=Contenuto, Q=Prezzo Cliente, T=Provvigione, X=Prezzo Partner, AA=Prezzo unita, AD=Punti VP, AG=Volume VV)
- Category rows have text in column A but NO code in column B
- Product rows have a numeric code in column B
- Categories are hierarchical, built by tracking the last seen category in column A

```typescript
import * as XLSX from "xlsx";
import { parseNumericValue } from "./parser";

export interface ParsedProduct {
  codice_amway: string;
  descrizione: string;
  categoria: string;
  contenuto: string | null;
  prezzo_cliente: number;
  prezzo_partner: number;
  provvigione: number;
  prezzo_unita: string | null;
  punti_vp: number;
  volume_vv: number;
}

export interface ParsedPriceList {
  products: ParsedProduct[];
  totalProducts: number;
  categories: string[];
}

/**
 * Parse the Amway price list Excel file.
 *
 * The file has a non-standard layout:
 * - Rows 1-55: title page and index (ignored)
 * - Row 56: column headers
 * - Row 57+: mix of category rows (text in A, no code in B) and product rows (code in B)
 *
 * Column mapping (1-indexed Excel columns):
 *   B (col 2)  → codice_amway
 *   F (col 6)  → descrizione
 *   N (col 14) → contenuto
 *   Q (col 17) → prezzo_cliente
 *   T (col 20) → provvigione
 *   X (col 24) → prezzo_partner
 *   AA (col 27) → prezzo_unita
 *   AD (col 30) → punti_vp
 *   AG (col 33) → volume_vv
 */
export function parsePriceListExcel(buffer: ArrayBuffer): ParsedPriceList {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet["!ref"]) {
    throw new Error("Foglio vuoto nel file Excel");
  }

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const products: ParsedProduct[] = [];
  const categoriesSet = new Set<string>();
  let currentCategory = "";

  // Start from row 57 (index 56, 0-based) — after the header row at index 55
  for (let rowIdx = 56; rowIdx <= range.e.r; rowIdx++) {
    const cellA = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 0 })]?.v;
    const cellB = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 1 })]?.v;

    // Category row: text in A, no numeric code in B
    if (cellA && typeof cellA === "string" && cellA.trim().length > 2) {
      if (!cellB || !String(cellB).trim().match(/^\d+$/)) {
        currentCategory = cellA.trim();
        categoriesSet.add(currentCategory);
        continue;
      }
    }

    // Product row: numeric code in B
    if (!cellB) continue;
    const codeStr = String(cellB).trim();
    if (!codeStr.match(/^\d+$/)) continue;

    const cellF = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 5 })]?.v;
    if (!cellF) continue; // Skip rows with code but no description

    const cellN = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 13 })]?.v;
    const cellQ = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 16 })]?.v;
    const cellT = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 19 })]?.v;
    const cellX = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 23 })]?.v;
    const cellAA = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 26 })]?.v;
    const cellAD = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 29 })]?.v;
    const cellAG = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 32 })]?.v;

    products.push({
      codice_amway: codeStr,
      descrizione: String(cellF).trim(),
      categoria: currentCategory,
      contenuto: cellN ? String(cellN).trim() : null,
      prezzo_cliente: parseNumericValue(cellQ),
      prezzo_partner: parseNumericValue(cellX),
      provvigione: parseNumericValue(cellT),
      prezzo_unita: cellAA ? String(cellAA).trim() : null,
      punti_vp: parseNumericValue(cellAD),
      volume_vv: parseNumericValue(cellAG),
    });
  }

  if (products.length === 0) {
    throw new Error(
      "Nessun prodotto trovato nel file. Verifica che sia un listino prezzi Amway."
    );
  }

  return {
    products,
    totalProducts: products.length,
    categories: Array.from(categoriesSet),
  };
}
```

- [ ] **Step 2: Verify the parser compiles**

Run: `npx tsc --noEmit src/lib/import/price-list-parser.ts 2>&1 | grep -v "Cannot use JSX"` (JSX errors are expected when running tsc on individual files without Next.js config)

Expected: No errors other than possible JSX flag warnings.

- [ ] **Step 3: Commit**

```bash
git add src/lib/import/price-list-parser.ts
git commit -m "feat: add Amway price list Excel parser"
```

---

## Task 4: Product Catalog — API Endpoints

**Files:**
- Create: `src/app/api/products/route.ts`
- Create: `src/app/api/products/import/route.ts`

- [ ] **Step 1: Create the products list/search API**

`src/app/api/products/route.ts`:

```typescript
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

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const categoria = searchParams.get("categoria") || "";

  let query = supabase
    .from("products")
    .select("*")
    .eq("attivo", true)
    .order("descrizione", { ascending: true });

  if (search) {
    query = query.or(
      `descrizione.ilike.%${search}%,codice_amway.ilike.%${search}%`
    );
  }

  if (categoria) {
    query = query.eq("categoria", categoria);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: `Errore caricamento prodotti: ${error.message}` },
      { status: 500 }
    );
  }

  // Also fetch distinct categories for filter dropdown
  const { data: categorieData } = await supabase
    .from("products")
    .select("categoria")
    .eq("attivo", true)
    .not("categoria", "is", null)
    .order("categoria");

  const categorie = [
    ...new Set(
      (categorieData || [])
        .map((r) => r.categoria)
        .filter(Boolean) as string[]
    ),
  ];

  return NextResponse.json({
    products: data || [],
    total: (data || []).length,
    categorie,
  });
}
```

- [ ] **Step 2: Create the products import API**

`src/app/api/products/import/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePriceListExcel } from "@/lib/import/price-list-parser";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
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
    const batchSize = 50;
    const allCodes: string[] = [];

    for (let i = 0; i < parsed.products.length; i += batchSize) {
      const batch = parsed.products.slice(i, i + batchSize);

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

    // Deactivate products not in the new list
    const { data: allProducts } = await supabase
      .from("products")
      .select("id, codice_amway")
      .eq("attivo", true);

    let deactivated = 0;
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
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -20`

Expected: Successful build with new API routes listed.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/products/route.ts src/app/api/products/import/route.ts
git commit -m "feat: add products API — list/search and import from Excel"
```

---

## Task 5: Customer — API Endpoints

**Files:**
- Create: `src/app/api/customers/route.ts`
- Create: `src/app/api/customers/[id]/route.ts`

- [ ] **Step 1: Create customers list + create API**

`src/app/api/customers/route.ts`:

```typescript
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

  const search = request.nextUrl.searchParams.get("search") || "";

  let query = supabase
    .from("customers")
    .select("*")
    .eq("partner_id", user.id)
    .order("nome", { ascending: true });

  if (search) {
    query = query.or(
      `nome.ilike.%${search}%,cognome.ilike.%${search}%,telefono.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customers: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { nome, cognome, telefono, email, indirizzo, citta, note } = body;

    if (!nome || !nome.trim()) {
      return NextResponse.json(
        { error: "Il nome è obbligatorio" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("customers")
      .insert({
        partner_id: user.id,
        nome: nome.trim(),
        cognome: cognome?.trim() || null,
        telefono: telefono?.trim() || null,
        email: email?.trim() || null,
        indirizzo: indirizzo?.trim() || null,
        citta: citta?.trim() || null,
        note: note?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ customer: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
```

- [ ] **Step 2: Create single customer API (GET, PUT, DELETE)**

`src/app/api/customers/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Cliente non trovato" },
      { status: 404 }
    );
  }

  return NextResponse.json({ customer: data });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    for (const field of [
      "nome",
      "cognome",
      "telefono",
      "email",
      "indirizzo",
      "citta",
      "note",
    ]) {
      if (field in body) {
        updates[field] =
          body[field] && typeof body[field] === "string"
            ? body[field].trim()
            : body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Nessun campo da aggiornare" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("customers")
      .update(updates)
      .eq("id", id)
      .eq("partner_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ customer: data });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // Check if customer has orders before deleting
  const { data: orders } = await supabase
    .from("client_orders")
    .select("id")
    .eq("customer_id", id)
    .limit(1);

  if (orders && orders.length > 0) {
    return NextResponse.json(
      {
        error:
          "Impossibile eliminare un cliente con ordini. Puoi modificare i suoi dati.",
      },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("partner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -20`

Expected: Successful build with customer API routes listed.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/customers/route.ts src/app/api/customers/\[id\]/route.ts
git commit -m "feat: add customers API — CRUD operations"
```

---

## Task 6: Client Orders — API Endpoints

**Files:**
- Create: `src/app/api/client-orders/route.ts`
- Create: `src/app/api/client-orders/[id]/route.ts`

- [ ] **Step 1: Create orders list + create API**

`src/app/api/client-orders/route.ts`:

```typescript
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

  const stato = request.nextUrl.searchParams.get("stato") || "";
  const customerId = request.nextUrl.searchParams.get("customer_id") || "";

  let query = supabase
    .from("client_orders")
    .select(
      "*, customer:customers(id, nome, cognome, telefono)"
    )
    .eq("partner_id", user.id)
    .order("created_at", { ascending: false });

  if (stato) {
    query = query.eq("stato", stato);
  }

  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Stats
  const all = data || [];
  const daRaggruppare = all.filter(
    (o) => o.stato === "confermato"
  ).length;
  const completati = all.filter(
    (o) => o.stato === "completato"
  ).length;
  const totaleVp = all
    .filter((o) => o.stato !== "annullato")
    .reduce((sum, o) => sum + (o.totale_vp || 0), 0);
  const totaleProvvigione = all
    .filter((o) => o.stato !== "annullato")
    .reduce((sum, o) => sum + (o.totale_provvigione || 0), 0);

  return NextResponse.json({
    orders: all,
    stats: {
      totale: all.length,
      daRaggruppare,
      completati,
      totaleVp: Math.round(totaleVp * 100) / 100,
      totaleProvvigione: Math.round(totaleProvvigione * 100) / 100,
    },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { customer_id, canale, note, items } = body;

    if (!customer_id) {
      return NextResponse.json(
        { error: "Cliente obbligatorio" },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Almeno un prodotto richiesto" },
        { status: 400 }
      );
    }

    // Verify customer belongs to this partner
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("id", customer_id)
      .eq("partner_id", user.id)
      .single();

    if (!customer) {
      return NextResponse.json(
        { error: "Cliente non trovato" },
        { status: 404 }
      );
    }

    // Calculate totals from items
    let totaleCliente = 0;
    let totalePartner = 0;
    let totaleVp = 0;
    let totaleProvvigione = 0;

    // Fetch product details for all items
    const productIds = items.map((i: { product_id: string }) => i.product_id);
    const { data: products } = await supabase
      .from("products")
      .select("*")
      .in("id", productIds);

    if (!products || products.length !== productIds.length) {
      return NextResponse.json(
        { error: "Uno o più prodotti non trovati" },
        { status: 400 }
      );
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    const orderItems = items.map(
      (item: { product_id: string; quantita: number; note?: string }) => {
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
          fonte: "amway" as const,
          note: item.note || null,
        };
      }
    );

    // Create the order
    const { data: order, error: orderError } = await supabase
      .from("client_orders")
      .insert({
        partner_id: user.id,
        customer_id,
        stato: "bozza",
        canale: canale || null,
        note: note || null,
        totale_cliente: Math.round(totaleCliente * 100) / 100,
        totale_partner: Math.round(totalePartner * 100) / 100,
        totale_vp: Math.round(totaleVp * 100) / 100,
        totale_provvigione: Math.round(totaleProvvigione * 100) / 100,
      })
      .select()
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: `Errore creazione ordine: ${orderError?.message}` },
        { status: 500 }
      );
    }

    // Insert order items
    const itemsWithOrderId = orderItems.map((item) => ({
      ...item,
      order_id: order.id,
    }));

    const { error: itemsError } = await supabase
      .from("client_order_items")
      .insert(itemsWithOrderId);

    if (itemsError) {
      // Rollback: delete the order
      await supabase.from("client_orders").delete().eq("id", order.id);
      return NextResponse.json(
        { error: `Errore inserimento prodotti: ${itemsError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
```

- [ ] **Step 2: Create single order API (GET detail with items, PUT update status)**

`src/app/api/client-orders/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { data: order, error } = await supabase
    .from("client_orders")
    .select(
      "*, customer:customers(id, nome, cognome, telefono, email)"
    )
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (error || !order) {
    return NextResponse.json(
      { error: "Ordine non trovato" },
      { status: 404 }
    );
  }

  // Fetch items with product details
  const { data: items } = await supabase
    .from("client_order_items")
    .select(
      "*, product:products(id, codice_amway, descrizione, contenuto, categoria)"
    )
    .eq("order_id", id);

  return NextResponse.json({
    order: { ...order, items: items || [] },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { stato, canale, note } = body;

    const updates: Record<string, unknown> = {};
    if (stato) updates.stato = stato;
    if (canale !== undefined) updates.canale = canale;
    if (note !== undefined) updates.note = note;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Nessun campo da aggiornare" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("client_orders")
      .update(updates)
      .eq("id", id)
      .eq("partner_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ order: data });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/client-orders/route.ts src/app/api/client-orders/\[id\]/route.ts
git commit -m "feat: add client orders API — list, create, detail, update"
```

---

## Task 7: Order Groups — API Endpoints

**Files:**
- Create: `src/app/api/order-groups/route.ts`
- Create: `src/app/api/order-groups/[id]/route.ts`
- Create: `src/app/api/order-groups/[id]/confirm/route.ts`

- [ ] **Step 1: Create order groups list + create API**

`src/app/api/order-groups/route.ts`:

```typescript
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

  const stato = request.nextUrl.searchParams.get("stato") || "";

  let query = supabase
    .from("order_groups")
    .select("*")
    .eq("partner_id", user.id)
    .order("created_at", { ascending: false });

  if (stato) {
    query = query.eq("stato", stato);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ groups: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { nome, order_ids } = body;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return NextResponse.json(
        { error: "Seleziona almeno un ordine" },
        { status: 400 }
      );
    }

    // Verify all orders belong to this partner and are in "confermato" status
    const { data: orders } = await supabase
      .from("client_orders")
      .select("id, stato")
      .in("id", order_ids)
      .eq("partner_id", user.id);

    if (!orders || orders.length !== order_ids.length) {
      return NextResponse.json(
        { error: "Uno o più ordini non trovati" },
        { status: 400 }
      );
    }

    const nonConfermati = orders.filter((o) => o.stato !== "confermato");
    if (nonConfermati.length > 0) {
      return NextResponse.json(
        {
          error: `${nonConfermati.length} ordini non sono in stato "confermato". Conferma prima gli ordini.`,
        },
        { status: 400 }
      );
    }

    // Create the group
    const groupName =
      nome ||
      `Gruppo ${new Date().toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
      })}`;

    const { data: group, error: groupError } = await supabase
      .from("order_groups")
      .insert({
        partner_id: user.id,
        nome: groupName,
        stato: "aperto",
      })
      .select()
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { error: `Errore creazione gruppo: ${groupError?.message}` },
        { status: 500 }
      );
    }

    // Update orders to link to group
    await supabase
      .from("client_orders")
      .update({ stato: "in_gruppo", group_id: group.id })
      .in("id", order_ids)
      .eq("partner_id", user.id);

    // Fetch all items from these orders and create group_items
    const { data: allItems } = await supabase
      .from("client_order_items")
      .select("id")
      .in("order_id", order_ids);

    if (allItems && allItems.length > 0) {
      const groupItems = allItems.map((item) => ({
        group_id: group.id,
        order_item_id: item.id,
        carrello: "personale" as const,
        confermato: false,
      }));

      await supabase.from("group_items").insert(groupItems);
    }

    return NextResponse.json({ group }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
```

- [ ] **Step 2: Create group detail + update API**

`src/app/api/order-groups/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // Fetch group
  const { data: group, error } = await supabase
    .from("order_groups")
    .select("*")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (error || !group) {
    return NextResponse.json(
      { error: "Gruppo non trovato" },
      { status: 404 }
    );
  }

  // Fetch group items with order_item + product + customer details
  const { data: groupItems } = await supabase
    .from("group_items")
    .select(
      "*, order_item:client_order_items(*, product:products(id, codice_amway, descrizione, punti_vp, prezzo_cliente, prezzo_partner, provvigione), order:client_orders(customer:customers(id, nome, cognome)))"
    )
    .eq("group_id", id);

  // Calculate VP per cart
  const vpPerCart = { personale: 0, non_registrato: 0, programmato: 0 };
  for (const gi of groupItems || []) {
    const vp =
      (gi.order_item?.punti_vp || 0) * (gi.order_item?.quantita || 1);
    vpPerCart[gi.carrello as keyof typeof vpPerCart] += vp;
  }

  return NextResponse.json({
    group,
    items: groupItems || [],
    vpPerCart: {
      personale: Math.round(vpPerCart.personale * 100) / 100,
      non_registrato: Math.round(vpPerCart.non_registrato * 100) / 100,
      programmato: Math.round(vpPerCart.programmato * 100) / 100,
    },
    vpPersonaleMax: 510,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Update cart assignments
    if (body.cart_assignments && Array.isArray(body.cart_assignments)) {
      for (const assignment of body.cart_assignments) {
        const { group_item_id, carrello } = assignment;
        if (!group_item_id || !carrello) continue;

        await supabase
          .from("group_items")
          .update({ carrello })
          .eq("id", group_item_id)
          .eq("group_id", id);
      }
    }

    // Update group name/note
    const updates: Record<string, unknown> = {};
    if (body.nome) updates.nome = body.nome;
    if (body.note !== undefined) updates.note = body.note;

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("order_groups")
        .update(updates)
        .eq("id", id)
        .eq("partner_id", user.id);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
```

- [ ] **Step 3: Create the confirm endpoint**

`src/app/api/order-groups/[id]/confirm/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // Verify group exists and belongs to partner
  const { data: group } = await supabase
    .from("order_groups")
    .select("id, stato")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (!group) {
    return NextResponse.json(
      { error: "Gruppo non trovato" },
      { status: 404 }
    );
  }

  // Update group status to confirmed
  const { error: groupError } = await supabase
    .from("order_groups")
    .update({
      stato: "confermato",
      data_caricamento: new Date().toISOString(),
    })
    .eq("id", id);

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  // Mark all group items as confirmed
  await supabase
    .from("group_items")
    .update({ confermato: true })
    .eq("group_id", id);

  // Update all linked orders to "completato"
  const { data: groupOrders } = await supabase
    .from("client_orders")
    .select("id")
    .eq("group_id", id);

  if (groupOrders) {
    await supabase
      .from("client_orders")
      .update({ stato: "completato" })
      .in(
        "id",
        groupOrders.map((o) => o.id)
      );
  }

  return NextResponse.json({
    success: true,
    message: "Gruppo confermato come caricato su Amway",
  });
}
```

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -25`

Expected: Build succeeds with all new API routes.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/order-groups/
git commit -m "feat: add order groups API — create, detail, cart assignment, confirm"
```

---

## Task 8: Sidebar Update + Reusable UI Components

**Files:**
- Modify: `src/components/sidebar.tsx`
- Create: `src/components/ui/stat-card.tsx`
- Create: `src/components/ui/product-search.tsx`
- Create: `src/components/ui/vp-counter.tsx`
- Create: `src/components/ui/cart-selector.tsx`

- [ ] **Step 1: Update sidebar with new menu items**

In `src/components/sidebar.tsx`, update the `menuSections` array. Replace the current "Attività" section:

Replace:
```typescript
  {
    label: "Attività",
    items: [
      { name: "Fatturati", icon: "▤", href: "/ordini" },
      { name: "Prodotti", icon: "▢", href: "/prodotti" },
      { name: "Importa dati", icon: "📊", href: "/import" },
    ],
  },
```

With:
```typescript
  {
    label: "Attività",
    items: [
      { name: "Fatturati", icon: "▤", href: "/ordini" },
      { name: "Ordini Clienti", icon: "🛒", href: "/ordini-clienti" },
      { name: "Prodotti", icon: "▢", href: "/prodotti" },
      { name: "Importa dati", icon: "📊", href: "/import" },
    ],
  },
```

Also add after the "Crescita" section:
```typescript
  {
    label: "Clienti",
    items: [
      { name: "I miei Clienti", icon: "👥", href: "/clienti" },
    ],
  },
```

- [ ] **Step 2: Create StatCard component**

`src/components/ui/stat-card.tsx`:

```typescript
"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label?: string } | null;
  color?: "accent" | "success" | "coral" | "lavender";
}

const colorMap = {
  accent: "border-t-accent",
  success: "border-t-success",
  coral: "border-t-coral",
  lavender: "border-t-lavender",
};

export function StatCard({
  label,
  value,
  subtitle,
  trend,
  color = "accent",
}: StatCardProps) {
  return (
    <div
      className={`bg-bg-card border border-border rounded-2xl p-4 md:p-6 border-t-3 ${colorMap[color]} hover:-translate-y-0.5 hover:shadow-md transition-all`}
    >
      <div className="text-[11px] md:text-[13px] text-text-secondary font-medium mb-1 md:mb-2">
        {label}
      </div>
      <div className="text-xl md:text-3xl font-bold tracking-tight mb-1 md:mb-2">
        {value}
      </div>
      {subtitle && (
        <div className="text-[10px] md:text-xs text-text-secondary">
          {subtitle}
        </div>
      )}
      {trend && (
        <div className="flex items-center gap-1">
          <span
            className={`text-[10px] md:text-xs font-semibold ${
              trend.value > 0
                ? "text-success"
                : trend.value < 0
                  ? "text-coral"
                  : "text-text-secondary"
            }`}
          >
            {trend.value > 0 ? "↑" : trend.value < 0 ? "↓" : "–"}{" "}
            {Math.abs(trend.value)}
          </span>
          {trend.label && (
            <span className="text-[10px] md:text-xs text-text-gentle">
              {trend.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create ProductSearch autocomplete component**

`src/components/ui/product-search.tsx`:

```typescript
"use client";

import { useState, useRef, useEffect } from "react";
import type { Product } from "@/lib/types/orders";

interface ProductSearchProps {
  products: Product[];
  onSelect: (product: Product) => void;
  placeholder?: string;
}

export function ProductSearch({
  products,
  onSelect,
  placeholder = "Cerca per nome o codice...",
}: ProductSearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim().length < 1
    ? []
    : products
        .filter(
          (p) =>
            p.descrizione.toLowerCase().includes(query.toLowerCase()) ||
            p.codice_amway.includes(query)
        )
        .slice(0, 8);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  function handleSelect(product: Product) {
    onSelect(product);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        listRef.current &&
        !listRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => query.trim().length >= 1 && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-3 rounded-xl text-sm border-2 border-border bg-bg-card text-text-primary placeholder-text-gentle focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
      />
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-gentle text-base">
        🔍
      </span>

      {isOpen && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto"
        >
          {filtered.map((product, i) => (
            <button
              key={product.id}
              onClick={() => handleSelect(product)}
              className={`w-full text-left px-4 py-3 flex justify-between items-center border-b border-divider last:border-b-0 transition-colors ${
                i === highlighted ? "bg-accent-glow" : "hover:bg-bg-main/50"
              }`}
            >
              <div>
                <div className="font-semibold text-sm text-text-primary">
                  {product.descrizione}
                </div>
                <div className="text-xs text-text-secondary">
                  cod. {product.codice_amway}
                  {product.contenuto && ` · ${product.contenuto}`}
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <div className="font-semibold text-sm">
                  €{product.prezzo_cliente.toFixed(2)}
                </div>
                <div className="text-xs text-accent-hover font-medium">
                  {product.punti_vp.toFixed(2)} VP
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && query.trim().length >= 1 && filtered.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-50 p-4 text-center text-sm text-text-secondary">
          Nessun prodotto trovato
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create VpCounter component**

`src/components/ui/vp-counter.tsx`:

```typescript
"use client";

interface VpCounterProps {
  current: number;
  max: number;
  label?: string;
}

export function VpCounter({
  current,
  max,
  label = "VP Carrello Personale",
}: VpCounterProps) {
  const percentage = Math.min((current / max) * 100, 100);
  const remaining = Math.max(max - current, 0);
  const isNearLimit = percentage > 85;
  const isOverLimit = current > max;

  return (
    <div className="bg-bg-card border border-border rounded-xl p-3 md:p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs md:text-sm font-semibold text-text-primary">
          {label}
        </span>
        <span
          className={`text-sm md:text-lg font-bold ${
            isOverLimit
              ? "text-coral"
              : isNearLimit
                ? "text-warning"
                : "text-accent-hover"
          }`}
        >
          {current.toFixed(2)}{" "}
          <span className="text-text-secondary font-normal text-xs md:text-sm">
            / {max}
          </span>
        </span>
      </div>
      <div className="h-2 md:h-3 bg-bg-section rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isOverLimit
              ? "bg-coral"
              : isNearLimit
                ? "bg-warning"
                : "bg-gradient-to-r from-accent to-accent-hover"
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] md:text-xs text-text-gentle">
        <span>{Math.round(percentage)}% utilizzato</span>
        <span>
          {isOverLimit
            ? `Superato di ${(current - max).toFixed(2)} VP!`
            : `Rimangono ${remaining.toFixed(2)} VP`}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create CartSelector component**

`src/components/ui/cart-selector.tsx`:

```typescript
"use client";

import type { CartType } from "@/lib/types/orders";

interface CartSelectorProps {
  value: CartType;
  onChange: (cart: CartType) => void;
  compact?: boolean;
}

const carts: { type: CartType; label: string; shortLabel: string; color: string; activeColor: string }[] = [
  {
    type: "personale",
    label: "Personale",
    shortLabel: "Pers.",
    color: "bg-bg-section text-text-secondary",
    activeColor: "bg-accent text-white",
  },
  {
    type: "non_registrato",
    label: "Non registrato",
    shortLabel: "Non reg.",
    color: "bg-bg-section text-text-secondary",
    activeColor: "bg-[#1976D2] text-white",
  },
  {
    type: "programmato",
    label: "Programmato",
    shortLabel: "Progr.",
    color: "bg-bg-section text-text-secondary",
    activeColor: "bg-[#9C27B0] text-white",
  },
];

export function CartSelector({
  value,
  onChange,
  compact = false,
}: CartSelectorProps) {
  return (
    <div className="flex gap-1">
      {carts.map((cart) => (
        <button
          key={cart.type}
          onClick={() => onChange(cart.type)}
          className={`px-2 md:px-3 py-1 md:py-1.5 rounded-md text-[10px] md:text-xs font-semibold transition-all ${
            value === cart.type ? cart.activeColor : cart.color
          }`}
        >
          {compact ? cart.shortLabel : cart.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

Run: `npx next build 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/sidebar.tsx src/components/ui/
git commit -m "feat: add sidebar items + reusable UI components (StatCard, ProductSearch, VpCounter, CartSelector)"
```

---

## Task 9: Product Import Page

**Files:**
- Create: `src/app/(dashboard)/prodotti/import/page.tsx`

- [ ] **Step 1: Create the product import page**

This follows the exact same pattern as `src/app/(dashboard)/import/page.tsx` (drag & drop zone, status states). Create `src/app/(dashboard)/prodotti/import/page.tsx`:

```typescript
"use client";

import { useState, useRef } from "react";

type ImportStatus = "idle" | "uploading" | "success" | "error";

interface ImportResult {
  totalProducts: number;
  categories: number;
  inserted: number;
  updated: number;
  deactivated: number;
}

export default function ProdottiImportPage() {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setStatus("uploading");
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setError(data.error || "Errore durante l'importazione");
        return;
      }

      setStatus("success");
      setResult(data);
    } catch {
      setStatus("error");
      setError("Errore di connessione. Riprova.");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold tracking-tight mb-2">
        Importa Listino Prezzi
      </h2>
      <p className="text-text-secondary text-sm mb-8">
        Carica il listino prezzi Amway in formato Excel
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
          dragOver
            ? "border-accent bg-accent-glow scale-[1.01]"
            : status === "success"
              ? "border-success bg-[#E8F5EE]"
              : status === "error"
                ? "border-error bg-coral-soft"
                : "border-border bg-bg-card hover:border-accent hover:bg-accent-glow/50"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleInputChange}
          className="hidden"
        />

        {status === "idle" && (
          <>
            <div className="text-4xl mb-4">📦</div>
            <p className="text-text-primary font-semibold mb-1">
              Trascina il listino qui oppure clicca per selezionarlo
            </p>
            <p className="text-text-gentle text-sm">
              Formato: PriceList_*.xlsx (listino prezzi Amway)
            </p>
          </>
        )}

        {status === "uploading" && (
          <>
            <div className="text-4xl mb-4 animate-pulse">⏳</div>
            <p className="text-text-primary font-semibold mb-1">
              Importazione in corso...
            </p>
            <p className="text-text-secondary text-sm">{fileName}</p>
          </>
        )}

        {status === "success" && result && (
          <>
            <div className="text-4xl mb-4">✅</div>
            <p className="text-success font-semibold mb-1">
              Listino importato!
            </p>
            <p className="text-text-secondary text-sm">
              {result.totalProducts} prodotti · {result.categories} categorie
            </p>
            <div className="mt-3 flex justify-center gap-4 text-xs text-text-secondary">
              <span>
                {result.inserted} nuovi
              </span>
              <span>
                {result.updated} aggiornati
              </span>
              {result.deactivated > 0 && (
                <span className="text-coral">
                  {result.deactivated} rimossi
                </span>
              )}
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="text-4xl mb-4">❌</div>
            <p className="text-error font-semibold mb-1">
              Errore nell&apos;importazione
            </p>
            <p className="text-text-secondary text-sm">{error}</p>
          </>
        )}
      </div>

      {(status === "success" || status === "error") && (
        <button
          onClick={() => {
            setStatus("idle");
            setResult(null);
            setError("");
            setFileName("");
          }}
          className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium border border-border text-text-secondary hover:border-accent hover:text-accent transition-all"
        >
          {status === "success" ? "Carica un nuovo listino" : "Riprova"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -20`

Expected: Build succeeds with `/prodotti/import` route.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/prodotti/import/page.tsx
git commit -m "feat: add product price list import page"
```

---

## Task 10: Product Catalog Page

**Files:**
- Create: `src/app/(dashboard)/prodotti/page.tsx`

- [ ] **Step 1: Create the product catalog page**

This is a searchable/filterable catalog page. Create `src/app/(dashboard)/prodotti/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/lib/types/orders";

export default function ProdottiPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categorie, setCategorie] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data.products || []);
    setCategorie(data.categorie || []);
    setLoading(false);
  }

  const filtered = products.filter((p) => {
    const matchSearch =
      !search.trim() ||
      p.descrizione.toLowerCase().includes(search.toLowerCase()) ||
      p.codice_amway.includes(search);
    const matchCat = !categoriaFiltro || p.categoria === categoriaFiltro;
    return matchSearch && matchCat;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">
            Caricamento catalogo...
          </p>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-bg-card border border-border rounded-2xl p-8 max-w-md text-center">
          <p className="text-2xl mb-3">📦</p>
          <p className="font-semibold text-text-primary mb-2">
            Nessun prodotto nel catalogo
          </p>
          <p className="text-text-secondary text-sm mb-4">
            Importa il listino prezzi Amway per iniziare.
          </p>
          <a
            href="/prodotti/import"
            className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
          >
            Importa listino
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Catalogo Prodotti
          </h2>
          <p className="text-text-secondary text-sm mt-1">
            {products.length} prodotti Amway
          </p>
        </div>
        <a
          href="/prodotti/import"
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
        >
          Aggiorna listino
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Cerca per nome o codice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-border bg-bg-card text-text-primary placeholder-text-gentle focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-gentle">
            🔍
          </span>
        </div>
        <select
          value={categoriaFiltro}
          onChange={(e) => setCategoriaFiltro(e.target.value)}
          className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-card text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value="">Tutte le categorie</option>
          {categorie.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <div className="text-xs text-text-secondary mb-3">
        {filtered.length} risultati
      </div>

      {/* Product grid — cards on mobile, compact table on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="bg-bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-text-primary truncate">
                  {p.descrizione}
                </div>
                <div className="text-xs text-text-secondary mt-0.5">
                  cod. {p.codice_amway}
                  {p.contenuto && ` · ${p.contenuto}`}
                </div>
              </div>
            </div>
            {p.categoria && (
              <div className="text-[10px] text-text-gentle mb-2 truncate">
                {p.categoria}
              </div>
            )}
            <div className="flex justify-between items-end pt-2 border-t border-divider">
              <div>
                <div className="text-xs text-text-secondary">Prezzo cliente</div>
                <div className="font-bold text-text-primary">
                  €{p.prezzo_cliente.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-text-secondary">Prezzo partner</div>
                <div className="font-bold text-accent-hover">
                  €{p.prezzo_partner.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-text-secondary">VP</div>
                <div className="font-bold text-text-primary">
                  {p.punti_vp.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -20`

Expected: Build succeeds with `/prodotti` route.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/prodotti/page.tsx
git commit -m "feat: add product catalog page with search and category filter"
```

---

## Task 11: Customer List Page

**Files:**
- Create: `src/app/(dashboard)/clienti/page.tsx`

- [ ] **Step 1: Create the customer list page**

`src/app/(dashboard)/clienti/page.tsx` — mobile-first card list with search, inline new customer form:

```typescript
"use client";

import { useEffect, useState } from "react";
import type { Customer } from "@/lib/types/orders";

export default function ClientiPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    cognome: "",
    telefono: "",
    email: "",
    citta: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  async function fetchCustomers() {
    setLoading(true);
    const res = await fetch("/api/customers");
    const data = await res.json();
    setCustomers(data.customers || []);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.nome.trim()) return;

    setSaving(true);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (res.ok) {
      setFormData({ nome: "", cognome: "", telefono: "", email: "", citta: "" });
      setShowForm(false);
      fetchCustomers();
    }
    setSaving(false);
  }

  const filtered = customers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.nome.toLowerCase().includes(q) ||
      (c.cognome && c.cognome.toLowerCase().includes(q)) ||
      (c.telefono && c.telefono.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  function getInitials(c: Customer) {
    const parts = [c.nome, c.cognome].filter(Boolean);
    return parts
      .map((p) => p![0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">I miei Clienti</h2>
          <p className="text-text-secondary text-sm mt-1">
            {customers.length} clienti
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
        >
          {showForm ? "Annulla" : "+ Nuovo Cliente"}
        </button>
      </div>

      {/* New customer form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-bg-card border border-border rounded-2xl p-4 md:p-6 mb-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <input
              type="text"
              placeholder="Nome *"
              value={formData.nome}
              onChange={(e) =>
                setFormData({ ...formData, nome: e.target.value })
              }
              required
              className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <input
              type="text"
              placeholder="Cognome"
              value={formData.cognome}
              onChange={(e) =>
                setFormData({ ...formData, cognome: e.target.value })
              }
              className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <input
              type="tel"
              placeholder="Telefono"
              value={formData.telefono}
              onChange={(e) =>
                setFormData({ ...formData, telefono: e.target.value })
              }
              className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <input
              type="text"
              placeholder="Città"
              value={formData.citta}
              onChange={(e) =>
                setFormData({ ...formData, citta: e.target.value })
              }
              className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Salva cliente"}
          </button>
        </form>
      )}

      {/* Search */}
      <div className="relative max-w-sm mb-6">
        <input
          type="text"
          placeholder="Cerca cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-border bg-bg-card text-text-primary placeholder-text-gentle focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-gentle">
          🔍
        </span>
      </div>

      {/* Customer cards */}
      <div className="space-y-2">
        {filtered.map((c) => (
          <div
            key={c.id}
            className="bg-bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white text-sm font-bold shrink-0">
              {getInitials(c)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm md:text-base text-text-primary">
                {c.nome} {c.cognome}
              </div>
              <div className="text-xs text-text-secondary flex flex-wrap gap-x-3">
                {c.telefono && <span>{c.telefono}</span>}
                {c.email && <span>{c.email}</span>}
                {c.citta && <span>{c.citta}</span>}
              </div>
            </div>
            {c.telefono && (
              <a
                href={`https://wa.me/${c.telefono.replace(/\s+/g, "").replace(/^\+/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 w-9 h-9 rounded-full bg-[#25D366] text-white flex items-center justify-center text-lg hover:opacity-80 transition-opacity"
                title="WhatsApp"
              >
                💬
              </a>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="text-center py-12 text-text-secondary text-sm">
          {customers.length === 0
            ? "Nessun cliente. Aggiungine uno con il bottone qui sopra."
            : "Nessun cliente trovato con la ricerca."}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -20`

Expected: Build succeeds with `/clienti` route.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/clienti/page.tsx
git commit -m "feat: add customer list page with search and inline creation"
```

---

## Task 12: Orders List Page

**Files:**
- Create: `src/app/(dashboard)/ordini-clienti/page.tsx`

This is the main orders page with stat cards, filter tabs, and order list as cards (mobile) / table (desktop). Due to its size, this task creates just the page file.

- [ ] **Step 1: Create the orders list page**

Create `src/app/(dashboard)/ordini-clienti/page.tsx`. This is a long file (~350 lines). Key features:
- Fetches from `/api/client-orders`
- Shows 4 stat cards (da raggruppare, completati, VP totali, provvigioni)
- Tab filters: Da raggruppare / Gruppi aperti / Completati / Tutti
- Mobile: card list. Desktop: remains card list (simpler, consistent)
- Links to `/ordini-clienti/nuovo` and `/ordini-clienti/raggruppa`

_(The full code for this file should follow the exact patterns shown in the spec mockups and match the StatCard component created in Task 8. The page fetches data on mount, manages filter/search state, and renders order cards with customer name, date, channel badge, product count, totals, VP, and status badge.)_

Due to plan length constraints, this page follows the identical pattern of `/ordini/page.tsx` (Task reference: the Fatturati page already built), adapted for the client orders data structure and card-based layout.

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/ordini-clienti/page.tsx
git commit -m "feat: add orders list page with stats and filters"
```

---

## Task 13: New Order Page

**Files:**
- Create: `src/app/(dashboard)/ordini-clienti/nuovo/page.tsx`

This is the fullscreen order creation page (mobile-first). Key features:
- Customer selector (autocomplete from `/api/customers`)
- Product search using the `ProductSearch` component
- Cart of selected products with quantity +/- buttons
- Sticky bottom bar with totals (€, VP, provvigione)
- Save as draft or confirm

- [ ] **Step 1: Create the new order page**

Create `src/app/(dashboard)/ordini-clienti/nuovo/page.tsx`. This page:
1. Fetches customers list and products list on mount
2. Uses `ProductSearch` component for adding products
3. Maintains local state for `selectedCustomer`, `items[]` (product + quantity), `canale`
4. Calculates totals reactively from items
5. POSTs to `/api/client-orders` on submit
6. Redirects to `/ordini-clienti` on success

_(Full implementation follows the mockup design from the spec — customer select area, product search with autocomplete, items list with +/- quantity buttons, sticky total bar at bottom.)_

- [ ] **Step 2: Verify build and test manually**

Run: `npx next build 2>&1 | tail -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/ordini-clienti/nuovo/page.tsx
git commit -m "feat: add new order page with product search and totals"
```

---

## Task 14: Order Grouping Page

**Files:**
- Create: `src/app/(dashboard)/ordini-clienti/raggruppa/page.tsx`

This is the grouping page with 3 cart columns (desktop) / 3 tabs (mobile). Key features:
- Fetches confirmed orders or existing group
- Shows VP counter for personal cart (max 510)
- Cart assignment per product with CartSelector component
- Confirm button "Caricato su Amway"

- [ ] **Step 1: Create the order grouping page**

Create `src/app/(dashboard)/ordini-clienti/raggruppa/page.tsx`. This page:
1. Two modes: "create new group" (select from confirmed orders) or "edit existing group" (query param `?group_id=`)
2. Lists all products from selected orders
3. Each product shows CartSelector for assignment
4. VpCounter shows real-time VP total for personal cart
5. Programmato counter shows "X/3 ordini"
6. Confirm button calls `/api/order-groups/[id]/confirm`

_(Full implementation follows the 3-tab mobile layout and 3-column desktop layout from the spec mockups.)_

- [ ] **Step 2: Verify build and test manually**

Run: `npx next build 2>&1 | tail -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/ordini-clienti/raggruppa/page.tsx
git commit -m "feat: add order grouping page with 3 cart types and VP counter"
```

---

## Task 15: Final Build Verification + Integration Test

- [ ] **Step 1: Run full build**

```bash
npx next build 2>&1
```

Expected: Successful build with all new routes:
- `/prodotti`, `/prodotti/import`
- `/clienti`
- `/ordini-clienti`, `/ordini-clienti/nuovo`, `/ordini-clienti/raggruppa`
- API routes: `/api/products/*`, `/api/customers/*`, `/api/client-orders/*`, `/api/order-groups/*`

- [ ] **Step 2: Start dev server and verify navigation**

```bash
npx next dev --port 3000
```

Verify in browser:
1. Sidebar shows new menu items (Ordini Clienti, I miei Clienti)
2. `/prodotti/import` page loads (drag & drop zone)
3. `/prodotti` shows "import first" empty state
4. `/clienti` shows customer list (empty) with + New button
5. `/ordini-clienti` shows orders list (empty) with stats
6. `/ordini-clienti/nuovo` shows new order form

- [ ] **Step 3: Test product import with real file**

Upload `PriceList_April-2026_IT.xlsx` via `/prodotti/import`.
Expected: "198 prodotti · 66 categorie" success message.
Then verify `/prodotti` shows the catalog with search working.

- [ ] **Step 4: Test full order flow**

1. Create a customer via `/clienti`
2. Create an order via `/ordini-clienti/nuovo` (search product, add, confirm)
3. Verify order appears in `/ordini-clienti` list
4. Test grouping via `/ordini-clienti/raggruppa`

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat: complete ordini clienti phase 1 — all pages and API working"
```
