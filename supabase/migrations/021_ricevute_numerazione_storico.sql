-- supabase/migrations/021_ricevute_numerazione_storico.sql
--
-- Decisione: https://github.com/Normecancelli/weshare/issues/7
-- - numero_ricevuta progressivo per partner+anno (es. 2026-001), assegnato
--   alla prima conferma ordine, persistente se l'ordine torna in bozza e
--   viene riconfermato, NON retroattivo sugli ordini già confermati.
-- - storico invii email (unico canale con conferma reale di invio).

ALTER TABLE client_orders ADD COLUMN numero_ricevuta TEXT;

-- Contatore per partner+anno. L'incremento atomico avviene nella funzione
-- next_receipt_number sotto (upsert con ON CONFLICT, serializzato da Postgres
-- sull'unique index del PK: due conferme simultanee non possono ottenere lo
-- stesso numero).
CREATE TABLE partner_receipt_counters (
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  anno INT NOT NULL,
  ultimo_numero INT NOT NULL DEFAULT 0,
  PRIMARY KEY (partner_id, anno)
);

ALTER TABLE partner_receipt_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_receipt_counters_own" ON partner_receipt_counters
  FOR ALL TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());

-- SECURITY DEFINER: bypassa RLS (stesso pattern di get_user_role /
-- get_user_platino_riferimento) così l'upsert atomico funziona anche se
-- chiamato come utente authenticated. Usa auth.uid() internamente (non un
-- parametro) così un partner non può far incrementare il contatore di un
-- altro passando un partner_id arbitrario.
CREATE OR REPLACE FUNCTION public.next_receipt_number(p_anno INT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_partner_id UUID := auth.uid();
  v_next INT;
BEGIN
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO partner_receipt_counters (partner_id, anno, ultimo_numero)
  VALUES (v_partner_id, p_anno, 1)
  ON CONFLICT (partner_id, anno)
  DO UPDATE SET ultimo_numero = partner_receipt_counters.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_next;

  RETURN p_anno::TEXT || '-' || lpad(v_next::TEXT, 3, '0');
END;
$$;

-- Storico invii email ricevuta. Un solo insert per invio riuscito (non per
-- tentativo) — vedi decisione: WhatsApp/PDF non tracciati, nessuna conferma
-- reale di invio disponibile per quei canali.
CREATE TABLE receipt_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES client_orders(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_receipt_email_log_order ON receipt_email_log(order_id);

ALTER TABLE receipt_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receipt_email_log_own" ON receipt_email_log
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM client_orders
      WHERE client_orders.id = receipt_email_log.order_id
      AND client_orders.partner_id = auth.uid()
    )
  );
