-- ============================================
-- Amway Partner — Database Schema
-- ============================================

-- Enum per i ruoli
CREATE TYPE user_role AS ENUM (
  'topadmin',
  'admin',
  'coadmin',
  'incaricato',
  'nuovo_iscritto',
  'prospect'
);

-- Enum per le qualifiche Amway
CREATE TYPE qualifica_amway AS ENUM (
  'nessuna',
  'silver',
  'gold',
  'platino',
  'smeraldo',
  'diamante'
);

-- Enum per tipo evento
CREATE TYPE evento_visibilita AS ENUM (
  'open',
  'gruppo',
  'silver',
  'gold',
  'platino',
  'smeraldo',
  'diamante'
);

-- ============================================
-- PROFILI UTENTE
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  codice_amway TEXT UNIQUE,
  nome TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  indirizzo TEXT,
  paese TEXT DEFAULT 'Italia',
  ruolo user_role NOT NULL DEFAULT 'nuovo_iscritto',
  qualifica qualifica_amway NOT NULL DEFAULT 'nessuna',
  data_ingresso DATE,
  data_rinnovo DATE,
  sponsor_id UUID REFERENCES profiles(id),
  codice_sponsor TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- FLAG TOPADMIN (per singolo Co-admin)
-- ============================================
CREATE TABLE coadmin_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coadmin_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  flag_name TEXT NOT NULL,
  flag_value BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(coadmin_id, flag_name)
);

-- Flag globali di sistema
CREATE TABLE system_flags (
  flag_name TEXT PRIMARY KEY,
  flag_value BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inserisci flag di default
INSERT INTO system_flags (flag_name, flag_value, description) VALUES
  ('coadmin_eventi_tutto_gruppo', TRUE, 'Se OFF, il Co-admin può creare eventi solo per il suo ramo'),
  ('coadmin_vede_entrate_ramo', TRUE, 'Accesso ai dati economici del proprio ramo'),
  ('coadmin_gestisce_prospect', FALSE, 'Permette al Co-admin di gestire i prospect del suo ramo'),
  ('codici_invito_scadenza_7gg', TRUE, 'I codici invito scadono dopo 7 giorni'),
  ('nuovo_iscritto_vede_catalogo', FALSE, 'Mostra catalogo prodotti ai nuovi iscritti'),
  ('log_accessi_attivo', TRUE, 'Registra tutti gli accessi al sistema');

-- ============================================
-- IMPORTAZIONI EXCEL
-- ============================================
CREATE TABLE imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  mese_riferimento TEXT NOT NULL,        -- formato YYYYMM
  filename TEXT NOT NULL,
  file_path TEXT,                         -- path in Supabase Storage
  sheet_name TEXT,                        -- nome foglio (codice amway)
  total_rows INTEGER,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, error
  error_message TEXT,
  column_mapping JSONB,                   -- mapping colonne usato
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(uploaded_by, mese_riferimento)
);

-- ============================================
-- DATI MENSILI IMPORTATI (dal file Excel)
-- ============================================
CREATE TABLE monthly_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  mese_riferimento TEXT NOT NULL,
  livello INTEGER,
  codice_partner TEXT NOT NULL,
  codice_sponsor TEXT,
  nome TEXT,
  paese TEXT,
  email TEXT,
  telefono TEXT,
  indirizzo TEXT,
  data_ingresso TEXT,
  data_rinnovo TEXT,
  vpg NUMERIC(12,2) DEFAULT 0,           -- Volume Punti Gruppo
  vpp NUMERIC(12,2) DEFAULT 0,           -- Volume Punti Personali
  vp_reso NUMERIC(12,2) DEFAULT 0,
  percentuale_bonus NUMERIC(5,2) DEFAULT 0,
  vvg NUMERIC(12,2) DEFAULT 0,           -- Volume Vendita Gruppo
  vp_cliente NUMERIC(12,2) DEFAULT 0,
  vp_rubino NUMERIC(12,2) DEFAULT 0,
  num_clienti INTEGER DEFAULT 0,
  punti_livello_successivo NUMERIC(12,2) DEFAULT 0,
  linee_qualificate INTEGER DEFAULT 0,
  dimensioni_gruppo INTEGER DEFAULT 0,
  num_ordini_personali INTEGER DEFAULT 0,
  num_ordini_multicarrello INTEGER DEFAULT 0,
  sponsorizzazione INTEGER DEFAULT 0,
  vpp_annuali NUMERIC(12,2) DEFAULT 0,
  totale_vp_organizzazione NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_monthly_data_mese ON monthly_data(mese_riferimento);
CREATE INDEX idx_monthly_data_codice ON monthly_data(codice_partner);
CREATE INDEX idx_monthly_data_import ON monthly_data(import_id);

-- ============================================
-- MAPPING COLONNE (configurazione persistente)
-- ============================================
CREATE TABLE column_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  header_amway TEXT NOT NULL UNIQUE,     -- nome colonna nel file Excel
  campo_interno TEXT NOT NULL,            -- nome campo in monthly_data
  obbligatorio BOOLEAN DEFAULT FALSE,
  attivo BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mapping di default (basato sul file analizzato)
INSERT INTO column_mappings (header_amway, campo_interno, obbligatorio) VALUES
  ('Qualifica Amway Partner', 'livello', TRUE),
  ('Codice Amway Partner Sponsor', 'codice_sponsor', TRUE),
  ('Codice Amway Partner', 'codice_partner', TRUE),
  ('Paese', 'paese', FALSE),
  ('Nome', 'nome', TRUE),
  ('Data di ingresso', 'data_ingresso', FALSE),
  ('Telefono', 'telefono', FALSE),
  ('Email', 'email', FALSE),
  ('Indirizzo', 'indirizzo', FALSE),
  ('Data di rinnovo', 'data_rinnovo', FALSE),
  ('VPG', 'vpg', TRUE),
  ('VPP', 'vpp', TRUE),
  ('VP reso', 'vp_reso', FALSE),
  ('Percentuale di bonus', 'percentuale_bonus', TRUE),
  ('VVG', 'vvg', FALSE),
  ('VP Cliente', 'vp_cliente', FALSE),
  ('VP Rubino', 'vp_rubino', FALSE),
  ('Clienti', 'num_clienti', FALSE),
  ('Punti al livello successivo', 'punti_livello_successivo', FALSE),
  ('Linee qualificate', 'linee_qualificate', FALSE),
  ('Dimensioni gruppo', 'dimensioni_gruppo', FALSE),
  ('Numero ordini personali', 'num_ordini_personali', FALSE),
  ('Numero ordini multicarrello', 'num_ordini_multicarrello', FALSE),
  ('Sponsorizzazione', 'sponsorizzazione', FALSE),
  ('VPP annuali', 'vpp_annuali', FALSE),
  ('Totale VP organizzazione', 'totale_vp_organizzazione', FALSE);

-- ============================================
-- CODICI INVITO
-- ============================================
CREATE TABLE invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  used_by UUID REFERENCES profiles(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invite_code ON invite_codes(code);

-- ============================================
-- EVENTI
-- ============================================
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  event_end TIMESTAMPTZ,
  location TEXT,
  visibilita evento_visibilita NOT NULL DEFAULT 'open',
  created_by UUID NOT NULL REFERENCES profiles(id),
  gruppo_id UUID REFERENCES profiles(id), -- se "solo il mio gruppo"
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_visibilita ON events(visibilita);

-- ============================================
-- LOG ACCESSI
-- ============================================
CREATE TABLE access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_access_logs_user ON access_logs(user_id);
CREATE INDEX idx_access_logs_date ON access_logs(created_at);

-- ============================================
-- TRIGGER: updated_at automatico
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
