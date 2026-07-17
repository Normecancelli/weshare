-- supabase/migrations/015_contenuti_vetrina.sql
-- Sistema contenuti Formazione/Presentazioni + vetrina prospect con link
-- individuale tracciabile. Spec: docs/superpowers/specs/2026-07-17-vetrina-prospect-formazione-design.md

CREATE TABLE public.contenuti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('formazione','presentazione')),
  titolo TEXT NOT NULL,
  descrizione TEXT,
  tema TEXT,
  media_tipo TEXT NOT NULL CHECK (media_tipo IN ('link_esterno','file')),
  url_esterno TEXT,
  file_path TEXT,
  visibile_prospect BOOLEAN NOT NULL DEFAULT FALSE,
  creato_da UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contenuti_tipo ON public.contenuti(tipo);
CREATE INDEX idx_contenuti_tema ON public.contenuti(tema);

ALTER TABLE public.contenuti ENABLE ROW LEVEL SECURITY;

CREATE POLICY contenuti_read ON public.contenuti FOR SELECT TO authenticated
  USING (true);

CREATE POLICY contenuti_insert ON public.contenuti FOR INSERT TO authenticated
  WITH CHECK (
    creato_da = auth.uid()
    AND (
      public.get_user_role() IN ('admin','topadmin')
      OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino','platino')
    )
  );

CREATE POLICY contenuti_update ON public.contenuti FOR UPDATE TO authenticated
  USING (
    creato_da = auth.uid()
    OR public.get_user_role() IN ('admin','topadmin')
  );

CREATE POLICY contenuti_delete ON public.contenuti FOR DELETE TO authenticated
  USING (
    creato_da = auth.uid()
    OR public.get_user_role() IN ('admin','topadmin')
  );

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'contenuti_updated_at'
  ) THEN
    CREATE TRIGGER contenuti_updated_at
      BEFORE UPDATE ON public.contenuti
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- Eventi visibili nella vetrina prospect (flag manuale, indipendente da visibilita)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS visibile_prospect BOOLEAN NOT NULL DEFAULT FALSE;

-- Link vetrina individuale per prospect (una riga attiva per prospect)
CREATE TABLE public.prospect_preview_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL UNIQUE REFERENCES public.prospects(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  view_count INT NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prospect_preview_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospect_preview_links_owner ON public.prospect_preview_links
  FOR ALL TO authenticated
  USING (prospect_id IN (SELECT id FROM public.prospects WHERE partner_id = auth.uid()))
  WITH CHECK (prospect_id IN (SELECT id FROM public.prospects WHERE partner_id = auth.uid()));

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'prospect_preview_links_updated_at'
  ) THEN
    CREATE TRIGGER prospect_preview_links_updated_at
      BEFORE UPDATE ON public.prospect_preview_links
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- Storage bucket contenuti (pubblico in lettura, upload gate applicativo in /api/contenuti/upload)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contenuti', 'contenuti', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "contenuti_bucket_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'contenuti');

CREATE POLICY "contenuti_bucket_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contenuti');

CREATE POLICY "contenuti_bucket_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'contenuti');
