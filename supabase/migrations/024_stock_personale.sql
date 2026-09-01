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
