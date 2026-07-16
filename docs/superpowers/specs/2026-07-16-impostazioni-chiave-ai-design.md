# Pagina Impostazioni + Chiave AI personale — Design

## Contesto

`/impostazioni` non esiste ancora. Lo spec originale (CLAUDE.md, "TODO aperti" punto 4, scritto 2026-06-13) definiva 5 sezioni: foto profilo, dati personali, profilo Amway, notifiche email, account. Non è mai stato costruito.

Motivo per cui lo costruiamo ora: la feature "Genera con AI" (eventi, sessione 2026-07-16, endpoint `POST /api/events/generate-description`) usa una `ANTHROPIC_API_KEY` globale pagata da Alejerry. Per non far gravare il costo su di lui, si introduce un tetto di 5 generazioni gratuite a vita per utente; superato il tetto, l'utente deve inserire la propria chiave Anthropic personale in una sezione della pagina Impostazioni per continuare a usare la feature. **Nessun pagamento, nessun piano a pagamento** — resta valido il modello "tool gratuito per il team" documentato in CLAUDE.md ("Modello di business").

## Correzione rispetto allo spec 2026-06-13

Verificato lo schema reale di `profiles` in produzione (query di sola lettura via client admin del progetto, non tramite i file migration locali che risultano disallineati):

- **Colonne già esistenti** (non vanno ri-create): `avatar_url` (lo spec originale proponeva `foto_url` — si riusa `avatar_url`), `preferenze_notifiche` (JSONB, già presente), `citta`, `paese`.
- **Colonne mai realmente applicate nonostante `migration 002` le dichiari** (drift file/DB): `codice_attivita`, `diamante_riferimento` — vanno create ora per davvero.
- **Numerazione migration corretta**: la prossima disponibile è `012` (non `006`, già occupata da `006_eventi.sql`; manca anche il file `005_signup_eventi.sql` nella cartella locale pur essendo stato applicato — drift noto, non blocca il lavoro).

## Migration `012_impostazioni.sql`

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cap TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS codice_attivita TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS diamante_riferimento_id UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_generations_count INT NOT NULL DEFAULT 0;
```

Nessuna migration su `preferenze_notifiche` (già esiste) né su `avatar_url` (già esiste, si riusa).

## Storage: bucket `avatars`

Bucket pubblico, policy upload ristretta a `auth.uid()`, path `{user_id}/avatar.jpg`. Resize lato client 512×512 via Canvas API, stesso pattern già usato per la locandina eventi in `event-form.tsx` (`resizeImage()`).

## Endpoint

- `GET /api/profile` — dati completi per la pagina Impostazioni: `nome`, `telefono`, `indirizzo`, `cap`, `citta`, `codice_amway` (read-only), `codice_attivita`, `qualifica`, `data_ingresso`, `platino_riferimento_id`, `diamante_riferimento_id`, `preferenze_notifiche`, `avatar_url`, `hasAnthropicKey: boolean` (mai la chiave in chiaro), `aiGenerationsRemaining: number | null` (`null` = ha chiave personale, illimitato).
- `PATCH /api/profile` — body parziale: dati personali, campi Amway (tranne `codice_amway`), `preferenze_notifiche`, `anthropic_api_key` (stringa per impostare, `null` esplicito per rimuovere).
- `POST /api/profile/avatar` — upload multipart, aggiorna `avatar_url`.
- `DELETE /api/profile/avatar` — rimuove file + azzera `avatar_url`.

Tutti gli endpoint: auth check standard (`supabase.auth.getUser()`), poi operazioni con `createAdminClient()` per leggere/scrivere `profiles` (stessa convenzione già in uso in tutto il progetto, vedi `getUserRole()`).

**Sicurezza chiave AI**: `anthropic_api_key` non viene mai restituita da `GET /api/profile` (solo il booleano `hasAnthropicKey`), salvata in chiaro nella colonna (stesso livello di fiducia già accordato ad altri dati sensibili nel progetto — nessuna cifratura applicativa aggiuntiva, decisione esplicita dell'utente).

## Logica limite generazioni AI

Modifica a `POST /api/events/generate-description` (esistente, commit `dd44307`):

1. Dopo il check auth, legge `anthropic_api_key` e `ai_generations_count` del profilo utente via `createAdminClient()`.
2. Se `anthropic_api_key` è presente → istanzia `new Anthropic({ apiKey: profilo.anthropic_api_key })`, **bypass totale del limite**, nessun incremento contatore.
3. Altrimenti, se `ai_generations_count >= 5` → risposta 403 `{ error: "Hai esaurito le 5 generazioni gratuite. Aggiungi la tua chiave Anthropic personale in Impostazioni per continuare." }`.
4. Altrimenti → procede con la chiave globale (`process.env.ANTHROPIC_API_KEY`), e **dopo una generazione riuscita** incrementa `ai_generations_count` di 1 (update via admin client).

`GET /api/auth/me` viene esteso con `aiGenerationsRemaining: number | null` (stesso valore/calcolo di `GET /api/profile`, per evitare che `event-form.tsx` debba chiamare un endpoint diverso da quello che già usa per i role-check).

`event-form.tsx`: nuovo `useEffect` che fetcha `/api/auth/me` al mount, salva `aiGenerationsRemaining` in state. Il pulsante "Genera con AI" viene renderizzato solo se `aiGenerationsRemaining === null || aiGenerationsRemaining > 0`. Se il limite è a 0 e non c'è chiave personale, il pulsante **non viene mostrato affatto** (nessun messaggio sostitutivo nel form — la spiegazione vive nella pagina Impostazioni).

## UI — pagina `/impostazioni`

Client component (`"use client"`), pattern identico a `event-form.tsx` (stato locale, fetch iniziale, salvataggio). Sei sezioni in card verticali (`bg-bg-card rounded-2xl border border-divider p-5`, stesso stile del resto dell'app):

1. **Foto profilo**: avatar grande (usa nuovo componente `<Avatar size="lg" profile={{avatar_url, nome}} />`), bottoni "Carica nuova foto" / "Rimuovi". Salvataggio immediato al cambio (non aspetta il bottone globale).
2. **Dati personali**: nome, cognome (nota: `profiles.nome` è un campo unico "nome e cognome" nello schema attuale, non separato — il form userà un solo campo "Nome e cognome" invece di due, per coerenza con lo schema reale), cellulare, indirizzo, cap, città.
3. **Profilo Amway**: `codice_amway` (read-only, sfondo disabilitato), `codice_attivita`, `qualifica` (dropdown, stesse opzioni di `EventoForm`/segnaposto già usate altrove: nessuna/silver/gold/platino/smeraldo/diamante), `data_ingresso` (date input), `platino_riferimento_id` e `diamante_riferimento_id` (autocomplete su `profiles`, stesso pattern del componente già esistente per `platino_riferimento_id` in altre pagine).
4. **Notifiche email**: 3 checkbox (reminder eventi, riepilogo settimanale, compleanni clienti), mappate su `preferenze_notifiche` JSONB.
5. **Chiave AI personale** (nuova): testo "Hai usato X/5 generazioni gratuite" (o "Generazioni illimitate — chiave personale attiva" se `hasAnthropicKey`), input password-style per incollare la chiave, bottone "Salva chiave" e, se già presente, "Rimuovi chiave". Link testuale a `https://console.anthropic.com/settings/keys` per crearne una.
6. **Account**: email (read-only, testo "Per cambiare contatta admin"), bottone "Cambia password" (→ `/auth/update-password`), bottone "Esci" (stessa azione già presente in sidebar).

Un bottone "Salva modifiche" in fondo copre le sezioni 2-4 (`PATCH /api/profile` con tutti i campi insieme). Sezioni 1 e 5 salvano autonomamente (upload avatar immediato; chiave AI con proprio bottone), per evitare che un salvataggio parziale lasci lo stato inconsistente.

Voce sidebar "Impostazioni" (oggi punta a `/impostazioni/email-template`, placeholder della Sessione B) viene aggiornata per puntare a `/impostazioni`. La pagina `/impostazioni/email-template` resta raggiungibile solo da link diretto per ora (fuori scope rimuoverla/integrarla).

## Fuori scope

- Cifratura applicativa della chiave AI personale (decisione esplicita: chiaro + accesso solo service-role).
- Reset mensile del limite (è un tetto a vita).
- Messaggio sostitutivo nel form quando il pulsante AI è nascosto per limite superato.
- Pagamenti, piani, fatturazione (esplicitamente esclusi, vedi CLAUDE.md).
- Migrazione/rimozione della pagina placeholder `/impostazioni/email-template`.
- Validazione del formato della chiave Anthropic oltre a un controllo minimo (non vuota); nessuna chiamata di verifica a console.anthropic.com prima del salvataggio.

## Testing

Manuale via dev server (nessun framework di test nel progetto, convenzione consolidata):
- Upload/rimozione avatar, verifica che `avatar_url` si aggiorni e il componente `<Avatar>` lo mostri ovunque sia usato.
- Salvataggio dati personali + profilo Amway + notifiche, ricaricamento pagina per verificare persistenza.
- Inserimento chiave AI: verifica che `GET /api/profile` non la restituisca mai in chiaro, solo `hasAnthropicKey: true`.
- Simulazione limite: azzerare/forzare `ai_generations_count` a 5 via SQL di test, verificare che il pulsante "Genera con AI" sparisca da `event-form.tsx`; impostare una chiave personale e verificare che il pulsante torni visibile e la generazione funzioni bypassando il contatore.
