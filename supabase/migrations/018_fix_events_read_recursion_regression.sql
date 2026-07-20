-- 018_fix_events_read_recursion_regression.sql
--
-- 014_qualifica_rls.sql ha ricreato events_read ripartendo dalla versione
-- pre-010 (subquery diretta su profiles), annullando senza volerlo il fix
-- di 010_fix_events_rls_recursion.sql. Risultato: "infinite recursion
-- detected in policy for relation profiles" alla creazione di un evento
-- (POST /api/events fa insert().select(), che valuta events_read in
-- RETURNING). Ripristina l'uso di get_user_platino_riferimento()
-- (SECURITY DEFINER, creata in 010, mai rimossa), mantenendo l'estensione
-- rubino/zaffiro introdotta da 014.

DROP POLICY IF EXISTS events_read ON public.events;

CREATE POLICY events_read ON public.events FOR SELECT TO authenticated
  USING (
    visibilita = 'globale'
    OR creato_da = auth.uid()
    OR (
      visibilita = 'gruppo'
      AND (
        platino_id = public.get_user_platino_riferimento()
        OR public.get_user_role() IN ('admin','topadmin')
        OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino')
      )
    )
  );
