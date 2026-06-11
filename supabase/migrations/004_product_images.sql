-- Predispone una colonna per l'URL immagine del prodotto.
-- Le immagini possono essere caricate su Supabase Storage (bucket pubblico
-- "product-images") oppure ovunque sia raggiungibile via HTTPS, poi
-- l'URL viene salvato qui.

ALTER TABLE products
ADD COLUMN IF NOT EXISTS image_url TEXT;
