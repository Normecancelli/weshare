-- supabase/migrations/019_prenotazione_eventi.sql
-- Pagina di prenotazione eventi per prospect senza account.
-- Vedi docs/superpowers/specs/2026-07-20-prenotazione-eventi-design.md

CREATE TABLE public.event_booking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  view_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, partner_id)
);

CREATE TABLE public.event_prospect_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  stato TEXT NOT NULL CHECK (stato IN ('confermato','in_attesa','annullato')) DEFAULT 'confermato',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, prospect_id)
);

-- Solo accesso via service role (createAdminClient): niente sessione utente
-- coinvolta in nessuno dei due flussi (link pubblico o vetrina prospect).
ALTER TABLE public.event_booking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_prospect_bookings ENABLE ROW LEVEL SECURITY;
-- Nessuna policy: RLS attiva senza policy = nessun accesso per authenticated/anon,
-- solo service role (bypassa RLS).

ALTER TABLE prospects DROP CONSTRAINT prospects_source_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_source_check
  CHECK (source IN ('contatto_personale', 'lista', 'social', 'referenza', 'altro', 'qr_link', 'prenotazione_evento'));
