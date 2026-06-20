-- ============================================
-- Prospect appointments + messages + follow-up flag (Phase 2)
-- Appointments use a client-generated "Add to Calendar" link;
-- google_event_id/google_sync_status are reserved for a future
-- OAuth sync sub-phase (unused in Phase 2).
-- Messages log partner-initiated email/WhatsApp sends (mailto/wa.me).
-- ============================================

CREATE TABLE prospect_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  titolo TEXT NOT NULL,
  data_ora TIMESTAMPTZ NOT NULL,
  durata_min INT NOT NULL DEFAULT 60,
  location TEXT,
  note TEXT,

  -- Reserved for future Google Calendar OAuth sync (unused in Phase 2)
  google_event_id TEXT,
  google_sync_status TEXT CHECK (google_sync_status IN ('synced', 'pending', 'failed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospect_appointments_prospect ON prospect_appointments(prospect_id);
CREATE INDEX idx_prospect_appointments_partner ON prospect_appointments(partner_id);
CREATE INDEX idx_prospect_appointments_data ON prospect_appointments(data_ora);

CREATE TABLE prospect_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  tipo TEXT NOT NULL CHECK (tipo IN ('email', 'whatsapp')),
  template_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospect_messages_prospect ON prospect_messages(prospect_id);
CREATE INDEX idx_prospect_messages_partner ON prospect_messages(partner_id);

-- Follow-up triage flag on the prospect itself (1:1 config)
ALTER TABLE prospects ADD COLUMN follow_up_flag TEXT NOT NULL DEFAULT 'da_valutare'
  CHECK (follow_up_flag IN ('da_valutare', 'inviare', 'non_inviare', 'sospeso'));

ALTER TABLE prospect_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospect_appointments_own" ON prospect_appointments
  FOR ALL TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());

CREATE POLICY "prospect_messages_own" ON prospect_messages
  FOR ALL TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());
