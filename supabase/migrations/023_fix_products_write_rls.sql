-- supabase/migrations/023_fix_products_write_rls.sql
--
-- Fix vulnerabilità: la policy "products_write" originale (002_ordini_clienti.sql)
-- ha commento "insert/update only by admin roles" ma la condizione reale era
-- USING (true) WITH CHECK (true) — qualsiasi utente autenticato poteva
-- modificare/cancellare qualunque prodotto (prezzi, provvigioni) chiamando
-- direttamente il client Supabase, bypassando il controllo isAdminRole
-- applicato solo in /api/products. Impatto: prezzo_partner/provvigione
-- vengono congelati in client_order_items alla creazione ordine (vedi
-- api/client-orders/add-item/route.ts), quindi un utente poteva alterare la
-- propria provvigione, creare l'ordine, e ripristinare il prezzo originale.
--
-- Stesso pattern SECURITY DEFINER già in uso nel repo (get_user_role) per
-- evitare ricorsioni RLS su profiles.

DROP POLICY IF EXISTS "products_write" ON products;

CREATE POLICY "products_write" ON products
  FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'topadmin'))
  WITH CHECK (get_user_role() IN ('admin', 'topadmin'));
