-- supabase/migrations/006_eventi.sql
-- Sessione B — Gestione Eventi

-- Tabella events precedente (2026-06-02, schema legacy con visibilita
-- silver/gold/platino/smeraldo/diamante, 0 righe) sostituita dallo schema
-- Sessione B definito nella spec 2026-06-29.
DROP TABLE IF EXISTS public.events CASCADE;
DROP TYPE IF EXISTS public.evento_visibilita;

CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descrizione TEXT,
  data_inizio TIMESTAMPTZ NOT NULL,
  data_fine TIMESTAMPTZ,
  location TEXT,
  location_url TEXT,
  modalita TEXT CHECK (modalita IN ('presenza','online','hybrid')),
  capienza_max INT,
  prezzo NUMERIC(10,2),
  link_prenotazione TEXT,
  link_evento TEXT,
  locandina_url TEXT,
  testo_reminder TEXT,
  reminder_sent_7d BOOLEAN DEFAULT false,
  reminder_sent_1d BOOLEAN DEFAULT false,
  visibilita TEXT NOT NULL CHECK (visibilita IN ('globale','gruppo')) DEFAULT 'gruppo',
  platino_id UUID REFERENCES public.profiles(id),
  creato_da UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.event_attendees (
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  stato TEXT CHECK (stato IN ('confermato','forse','annullato')) DEFAULT 'confermato',
  responded_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- RLS events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

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
        OR public.get_user_qualifica() IN ('diamante','smeraldo')
      )
    )
  );

CREATE POLICY events_insert ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    creato_da = auth.uid()
    AND (
      public.get_user_role() IN ('admin','topadmin')
      OR public.get_user_qualifica() IN ('diamante','smeraldo','platino')
    )
  );

CREATE POLICY events_update ON public.events FOR UPDATE TO authenticated
  USING (
    creato_da = auth.uid()
    OR public.get_user_role() IN ('admin','topadmin')
  );

CREATE POLICY events_delete ON public.events FOR DELETE TO authenticated
  USING (
    creato_da = auth.uid()
    OR public.get_user_role() IN ('admin','topadmin')
  );

-- RLS event_attendees
ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY attendees_own ON public.event_attendees FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY attendees_read_organizer ON public.event_attendees FOR SELECT TO authenticated
  USING (
    event_id IN (SELECT id FROM public.events WHERE creato_da = auth.uid())
    OR public.get_user_role() IN ('admin','topadmin')
    OR public.get_user_qualifica() IN ('diamante','smeraldo')
  );

-- Trigger updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'events_updated_at'
  ) THEN
    CREATE TRIGGER events_updated_at
      BEFORE UPDATE ON public.events
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- Storage bucket event-covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-covers', 'event-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "event_covers_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'event-covers');

CREATE POLICY "event_covers_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-covers');

CREATE POLICY "event_covers_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'event-covers');
