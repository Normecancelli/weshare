-- supabase/migrations/022_contenuto_likes.sql
-- Cuore/like sui contenuti (Formazione/Presentazioni): un like per partner
-- per contenuto, conteggio visibile a tutti.

CREATE TABLE public.contenuto_likes (
  contenuto_id UUID NOT NULL REFERENCES public.contenuti(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contenuto_id, partner_id)
);

CREATE INDEX idx_contenuto_likes_contenuto ON public.contenuto_likes(contenuto_id);

ALTER TABLE public.contenuto_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY contenuto_likes_read ON public.contenuto_likes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY contenuto_likes_write ON public.contenuto_likes FOR INSERT TO authenticated
  WITH CHECK (partner_id = auth.uid());

CREATE POLICY contenuto_likes_delete ON public.contenuto_likes FOR DELETE TO authenticated
  USING (partner_id = auth.uid());
