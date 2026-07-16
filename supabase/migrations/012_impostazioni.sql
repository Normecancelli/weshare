-- 012_impostazioni.sql
-- Colonne mancanti per la pagina /impostazioni (verificate contro lo schema
-- reale di produzione: avatar_url e preferenze_notifiche esistono già,
-- nonostante lo spec 2026-06-13 in CLAUDE.md assumesse il contrario).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cap TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS codice_attivita TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS diamante_riferimento_id UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_generations_count INT NOT NULL DEFAULT 0;

-- Bucket storage avatar (pubblico, upload ristretto al proprietario)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "avatars_owner_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_owner_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_owner_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
