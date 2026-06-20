-- ============================================
-- Prospects (pipeline contatti/lead)
-- Phase 1: core CRUD. Conversion + follow-up messaging columns
-- are created now so Phases 2-3 need no schema change.
-- ============================================

CREATE TABLE prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Contact data
  nome TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  citta TEXT,
  source TEXT NOT NULL DEFAULT 'altro'
    CHECK (source IN ('contatto_personale', 'lista', 'social', 'referenza', 'altro')),
  note TEXT,

  -- Pipeline state
  stato TEXT NOT NULL DEFAULT 'nuovo_contatto'
    CHECK (stato IN ('nuovo_contatto', 'primo_appt', 'secondo_appt',
                     'convertito_cliente', 'convertito_partner', 'follow_up')),

  -- Follow-up categorization (only when stato = 'follow_up')
  sub_tag_follow_up TEXT
    CHECK (sub_tag_follow_up IN ('interessato_non_ora', 'necessita_info', 'ha_detto_no', 'custom')),
  sub_tag_custom TEXT,

  -- Follow-up cadence + next action reminder
  cadenza_giorni INT NOT NULL DEFAULT 14,
  prossima_data_reminder DATE,

  -- Conversion tracking (Phase 3 — columns reserved, unused in Phase 1)
  convertito_a TEXT CHECK (convertito_a IN ('cliente', 'partner')),
  customer_id UUID REFERENCES customers(id),
  profile_id_nuovo_partner UUID REFERENCES profiles(id),
  data_conversione TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospects_partner ON prospects(partner_id);
CREATE INDEX idx_prospects_stato ON prospects(stato);
CREATE INDEX idx_prospects_prossima_data ON prospects(prossima_data_reminder);

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospects_own" ON prospects
  FOR ALL TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());
