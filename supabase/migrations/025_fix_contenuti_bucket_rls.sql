-- supabase/migrations/025_fix_contenuti_bucket_rls.sql
--
-- Fix vulnerabilità: https://github.com/Normecancelli/weshare/issues/9
-- Le policy INSERT e DELETE su storage.objects per il bucket 'contenuti'
-- (015_contenuti_vetrina.sql) permettevano la scrittura/cancellazione a
-- qualsiasi utente autenticato, non solo a chi ha ruolo/qualifica idonea.
-- Il controllo "solo admin/topadmin/diamante/smeraldo/zaffiro/rubino/platino"
-- era applicato solo a livello applicativo in canCreateEvent()
-- (POST /api/contenuti/upload-url), bypassabile con una chiamata diretta al
-- client Supabase. Stesso gate già usato dalla policy contenuti_insert sulla
-- tabella contenuti stessa.
--
-- Stesso pattern SECURITY DEFINER già in uso nel repo (get_user_role /
-- get_user_qualifica) per evitare ricorsioni RLS su profiles — vedi anche
-- 023_fix_products_write_rls.sql per un fix analogo.

DROP POLICY IF EXISTS "contenuti_bucket_auth_insert" ON storage.objects;

CREATE POLICY "contenuti_bucket_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contenuti'
    AND (
      public.get_user_role() IN ('admin','topadmin')
      OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino','platino')
    )
  );

DROP POLICY IF EXISTS "contenuti_bucket_auth_delete" ON storage.objects;

CREATE POLICY "contenuti_bucket_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'contenuti'
    AND (
      public.get_user_role() IN ('admin','topadmin')
      OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino','platino')
    )
  );
