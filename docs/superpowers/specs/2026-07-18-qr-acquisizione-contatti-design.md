# QR/Link fisso acquisizione contatti — Design

## Contesto

Oggi acquisire un nuovo contatto (prospect) richiede due passaggi manuali del partner: creare la scheda in `/contatti` (nome, telefono, email a mano), poi generare un link vetrina individuale (`/anteprima/[token]`, valido 30gg) da inviare via WhatsApp/email. Friction reale quando il partner è a un evento/fiera e vuole raccogliere contatti al volo.

Questa feature introduce un **link/QR fisso per partner** (non scade, non va rigenerato) che il prospect apre da solo: compila un mini-form (nome, cognome, telefono, email) e la sua scheda `prospects` viene creata/aggiornata automaticamente, senza che il partner debba scrivere nulla. Si appoggia sull'infrastruttura vetrina già esistente (`docs/superpowers/specs/2026-07-17-vetrina-prospect-formazione-design.md`): dopo il submit il prospect atterra sulla stessa pagina `/anteprima/[token]` (eventi + contenuti + CTA WhatsApp).

Va tenuto separato dal link di reclutamento partner esistente (`/invite/[slug]` → `/registrati`, per chi vuole entrare nel team Amway): pubblici diversi, pagine diverse, anche se riusano lo stesso `invite_url_slug` come identificatore.

## Decisioni chiave

- **Rotta pubblica dedicata**: `/contatto/[slug]`, `slug` = `profiles.invite_url_slug` (stesso valore già usato da `/invite/[slug]`, nessun nuovo campo). Non sostituisce `/invite/[slug]`, che resta invariato per il reclutamento partner.
- **Link fisso, non a scadenza**: a differenza del link vetrina per-prospect (30gg, rigenerabile), questo è legato allo slug del partner — si stampa/salva una volta e resta valido per sempre.
- **Landing post-submit**: redirect a `/anteprima/[token]`, la vetrina eventi/contenuti già esistente. Il form diventa il "cancello d'ingresso" a quella pagina.
- **Dedup**: al submit si cerca tra i prospect del partner un match per telefono O email; se trovato si aggiorna quel record (nome/telefono/email/`updated_at`), altrimenti se ne crea uno nuovo. Il match resta scoperto (`partner_id`) — mai cross-partner.
- **Nome/cognome**: `prospects` ha un solo campo `nome` (nome completo, convenzione già usata in tutta l'app — es. `profiles.nome = "SETTEN ALESSANDRO"`). Il form pubblico mostra comunque due input separati (Nome, Cognome) per chiarezza UX; il client li concatena in un'unica stringa prima di inviarli all'API. Nessuna modifica di schema.
- **Nuova sorgente**: `prospects.source = 'qr_link'` per distinguere in analytics questi contatti da quelli inseriti a mano.
- **QR code self-hosted**: generato client-side con pacchetto npm `qrcode`, nessuna chiamata a servizi esterni (l'URL non viene mai inviato fuori dall'app).
- **Bottone "My QrCode"**: presente sia in `/contatti` (accanto a "+ Nuovo contatto") sia in `/impostazioni` (sezione Profilo Amway). Stesso componente `<ContactQrCard>` in entrambi i punti.
- **Riutilizzo dati in fase di iscrizione a partner**: quando il partner converte un prospect in partner (bottone "Converti" esistente, `convert-modal.tsx`), il link invito generato include ora anche `&prospect=[id]`. `/registrati` lo usa per precompilare nome/telefono/email (restano modificabili) via un endpoint pubblico che espone solo quei tre campi.
- **Anti-abuso leggero**: campo honeypot nascosto nel form pubblico (bot-trap silenzioso, nessun captcha visibile) + validazione minima server-side (nome obbligatorio, almeno uno tra telefono/email). Nessun rate-limiting dedicato: il link si condivide a mano/QR fisico, non è un endpoint esposto a scraping di massa.

## Data model — migration `017_qr_acquisizione_contatti.sql`

```sql
-- Nome vincolo per convenzione Postgres (tabella_colonna_check); verificare
-- in fase di implementazione con \d prospects prima di applicare, dato che
-- l'ambiente di sviluppo non ha accesso di rete al DB per confermarlo ora.
ALTER TABLE prospects DROP CONSTRAINT prospects_source_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_source_check
  CHECK (source IN ('contatto_personale', 'lista', 'social', 'referenza', 'altro', 'qr_link'));
```

Nessuna nuova tabella: si riusano `prospects` e `prospect_preview_links` (migration `007`/`015`) così come sono.

## API

- `POST /api/contatto/[slug]` — **pubblica**, `createAdminClient()`:
  1. `sanitizeSlug(slug)` → risolve `profiles.invite_url_slug` (stesso pattern di `GET /api/sponsor/[slug]`). Non trovato → 404 "Link non valido".
  2. Valida body: `nome` obbligatorio, almeno uno tra `telefono`/`email`, campo honeypot vuoto (se valorizzato → 200 silenzioso senza scrivere nulla, per non rivelare al bot che è stato bloccato).
  3. Cerca in `prospects` (scoped `partner_id`) un match per `telefono` o `email` → `UPDATE` (`nome` concatenato, telefono, email, `updated_at`) oppure `INSERT` (`source='qr_link'`, `stato='nuovo_contatto'`).
  4. Upsert su `prospect_preview_links` per quel `prospect_id` (stessa logica di `POST /api/prospects/[id]/preview-link`, estratta in helper condiviso `src/lib/prospects/preview-link.ts` per non duplicare codice tra route autenticata e pubblica).
  5. Ritorna `{ url: "/anteprima/[token]" }`.
- `GET /api/prospects/public/[id]` — **pubblica**, `createAdminClient()`: ritorna solo `{ nome, telefono, email }` del prospect, e solo se `convertito_a IS NULL` (evita di esporre dati di un prospect già convertito/chiuso). Usata da `/registrati` per il prefill.
- `POST /api/prospects/[id]/convert` (esistente, `convertTo: "partner"`): nessuna modifica server-side: il client (`convert-modal.tsx`) costruisce l'URL con `&prospect=${prospect.id}` in aggiunta allo slug già ritornato.

## Middleware

Aggiungere a `isPublicPath` in `src/lib/supabase/middleware.ts`: `path.startsWith("/contatto")`, `path.startsWith("/api/contatto/")`, `path.startsWith("/api/prospects/public/")` — stesso trattamento di `/invite` e `/api/sponsor`.

## UI

**`src/components/prospects/contact-qr-card.tsx`** (nuovo, condiviso): mostra link fisso (`{origin}/contatto/{slug}`) con bottone copia, QR renderizzato via `qrcode` (canvas), bottone "Scarica PNG". Se il partner non ha ancora un `invite_url_slug` impostato, messaggio (`InlineMessage variant="warning"`) che rimanda a `/impostazioni` per impostare il codice Amway (stesso vincolo già presente in `convert-modal.tsx` per il link invito partner).

**`/contatti`**: bottone **"My QrCode"** accanto a "+ Nuovo contatto" → apre modal con `<ContactQrCard>`.

**`/impostazioni`**: sezione Profilo Amway, stesso `<ContactQrCard>` inline (non in modal), come asset personale sempre visibile.

**`/contatto/[slug]`** (nuova pagina pubblica): stile analogo a `/invite/[slug]` (header "Sei stato invitato da [Nome partner]"), form nome/cognome/telefono/email + campo honeypot nascosto (`display:none`, nome tipo `website` per ingannare i bot). Submit → loading → redirect a `/anteprima/[token]` ritornato dall'API. Slug non trovato → stessa pagina di errore di `/invite/[slug]` ("Link non valido").

**`/registrati`**: se in query è presente `prospect`, `useEffect` fetch a `GET /api/prospects/public/[id]` per precompilare `nome`/`telefono`/`email` nello state del form (i campi restano editabili, nessun campo readonly).

## Fuori scope

- Rate-limiting/captcha visibile sul form pubblico.
- Notifica al partner quando arriva un nuovo contatto da QR (resta da controllare in `/contatti` come per gli altri prospect).
- Unificazione con `/invite/[slug]` in un'unica pagina con scelta iniziale (valutata e scartata: pubblici troppo diversi).
- Personalizzazione grafica del PNG scaricato (logo, cornice) — solo QR + testo minimo.

## Testing

Nessuna suite automatica in questo progetto (verifica manuale via browser):

1. Generare il QR da `/contatti` e da `/impostazioni`, verificare che puntino allo stesso URL (`invite_url_slug` del partner loggato).
2. Aprire `/contatto/[slug]` in sessione incognita, compilare il form, verificare redirect a `/anteprima/[token]` e che il prospect compaia in `/contatti` con `source = qr_link`.
3. Ripetere il submit con lo stesso telefono → verificare che aggiorni il prospect esistente invece di duplicarlo.
4. Compilare il campo honeypot via devtools → verificare che non venga creato/aggiornato nessun prospect.
5. Slug inesistente → pagina "Link non valido".
6. Da `/contatti/[id]`, "Converti" → "A Partner", verificare che il link generato contenga `&prospect=`, aprirlo in incognito e verificare il prefill su `/registrati`.
7. Prospect già `convertito_a` non NULL → `GET /api/prospects/public/[id]` non deve ritornare dati (verifica che `/registrati` non li precompili).
