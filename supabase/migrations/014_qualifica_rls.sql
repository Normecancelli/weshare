-- 014_qualifica_rls.sql
-- Aggiorna le RLS policy che avevano Smeraldo/Diamante (e Platino) hardcoded
-- nelle liste di qualifiche ammesse, includendo anche Rubino/Zaffiro.
--
-- PRECONDIZIONE: richiede che 013_qualifica_enum_valori.sql sia già stata
-- eseguita ed effettivamente COMMITTATA (esecuzione separata) — `qualifica`
-- è un enum Postgres nativo (`qualifica_amway`), non testo libero: usare
-- 'rubino'/'zaffiro' prima che l'enum li contenga genera l'errore
-- "invalid input value for enum qualifica_amway".

-- events_read: chi vede eventi "gruppo" di altri platino_id
DROP POLICY IF EXISTS events_read ON public.events;
CREATE POLICY events_read ON public.events FOR SELECT TO authenticated
  USING (
    visibilita = 'globale'
    OR creato_da = auth.uid()
    OR (
      visibilita = 'gruppo'
      AND (
        platino_id IN (
          SELECT platino_riferimento_id FROM public.profiles WHERE id = auth.uid()
        )
        OR public.get_user_role() IN ('admin','topadmin')
        OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino')
      )
    )
  );

-- events_insert: chi può creare eventi (platino o superiore)
DROP POLICY IF EXISTS events_insert ON public.events;
CREATE POLICY events_insert ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    creato_da = auth.uid()
    AND (
      public.get_user_role() IN ('admin','topadmin')
      OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino','platino')
    )
  );

-- attendees_read_organizer: chi vede la lista iscritti di qualsiasi evento
DROP POLICY IF EXISTS attendees_read_organizer ON public.event_attendees;
CREATE POLICY attendees_read_organizer ON public.event_attendees FOR SELECT TO authenticated
  USING (
    event_id IN (SELECT id FROM public.events WHERE creato_da = auth.uid())
    OR public.get_user_role() IN ('admin','topadmin')
    OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino')
  );
