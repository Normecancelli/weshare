-- ============================================
-- Customer Dates (promemoria date clienti)
-- ============================================

CREATE TABLE customer_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  descrizione TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_dates_customer ON customer_dates(customer_id);
CREATE INDEX idx_customer_dates_data ON customer_dates(data);

ALTER TABLE customer_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_dates_own" ON customer_dates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.id = customer_dates.customer_id
      AND customers.partner_id = auth.uid()
    )
  );
