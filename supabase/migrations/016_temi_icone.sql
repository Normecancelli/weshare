-- supabase/migrations/016_temi_icone.sql
-- Icona lucide-react per tema (non per singolo contenuto). Spec:
-- docs/superpowers/specs/2026-07-17-icone-temi-contenuti-design.md

CREATE TABLE public.temi_icone (
  tema TEXT PRIMARY KEY,
  icona TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.temi_icone ENABLE ROW LEVEL SECURITY;

CREATE POLICY temi_icone_read ON public.temi_icone FOR SELECT TO authenticated
  USING (true);

CREATE POLICY temi_icone_write ON public.temi_icone FOR ALL TO authenticated
  USING (
    public.get_user_role() IN ('admin','topadmin')
    OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino','platino')
  )
  WITH CHECK (
    public.get_user_role() IN ('admin','topadmin')
    OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino','platino')
  );

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'temi_icone_updated_at'
  ) THEN
    CREATE TRIGGER temi_icone_updated_at
      BEFORE UPDATE ON public.temi_icone
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;
