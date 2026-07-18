-- supabase/migrations/017_qr_acquisizione_contatti.sql
-- Nuova sorgente prospect per i contatti arrivati dal form pubblico
-- /contatto/[slug] (QR/link fisso), per distinguerli in analytics dai
-- contatti inseriti a mano dal partner.
ALTER TABLE prospects DROP CONSTRAINT prospects_source_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_source_check
  CHECK (source IN ('contatto_personale', 'lista', 'social', 'referenza', 'altro', 'qr_link'));
