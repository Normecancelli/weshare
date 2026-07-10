-- ============================================
-- Permette la rimozione di articoli da un ordine
-- già raggruppato: se un client_order_items viene
-- eliminato, la riga group_items collegata deve
-- sparire con lui invece di bloccare la delete con
-- un errore di foreign key.
-- ============================================
ALTER TABLE group_items
  DROP CONSTRAINT group_items_order_item_id_fkey;

ALTER TABLE group_items
  ADD CONSTRAINT group_items_order_item_id_fkey
  FOREIGN KEY (order_item_id) REFERENCES client_order_items(id) ON DELETE CASCADE;
