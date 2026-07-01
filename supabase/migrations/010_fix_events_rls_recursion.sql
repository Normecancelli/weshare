-- supabase/migrations/010_fix_events_rls_recursion.sql
--
-- profiles_select_coadmin fa una subquery diretta su profiles, che causa
-- "infinite recursion detected in policy for relation profiles" per QUALSIASI
-- query su profiles eseguita come ruolo authenticated (non bypassrls).
-- events_read aveva una subquery diretta equivalente: sostituita con una
-- funzione SECURITY DEFINER (stesso pattern di get_user_role/get_user_qualifica,
-- che bypassano RLS perché owner postgres ha bypassrls=true).

CREATE OR REPLACE FUNCTION public.get_user_platino_riferimento()
RETURNS UUID
LANGUAGE SQL SECURITY DEFINER STABLE
AS $$
  SELECT platino_riferimento_id FROM profiles WHERE id = auth.uid();
$$;

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
        OR public.get_user_qualifica() IN ('diamante','smeraldo')
      )
    )
  );
