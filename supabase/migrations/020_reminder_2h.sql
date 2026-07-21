-- supabase/migrations/020_reminder_2h.sql
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS reminder_sent_2h BOOLEAN NOT NULL DEFAULT false;
