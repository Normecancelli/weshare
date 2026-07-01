-- supabase/migrations/009_system_flags_value_column.sql
-- system_flags aveva solo flag_name (PK) + flag_value BOOLEAN.
-- Il template email reminder (Sessione B) richiede di salvare testo libero,
-- quindi aggiungiamo una colonna value TEXT, chiave = flag_name = 'email_reminder_template'.

ALTER TABLE public.system_flags ADD COLUMN IF NOT EXISTS value TEXT;
