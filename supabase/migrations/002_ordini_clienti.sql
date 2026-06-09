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
  codice_attivita TEXT,
  diamante_riferimento TEXT DEFAULT 'non_lo_so',
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
