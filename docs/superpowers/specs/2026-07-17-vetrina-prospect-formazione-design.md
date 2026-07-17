# Formazione/Presentazioni + Vetrina Prospect — Design

## Contesto

`/formazione` e `/presentazioni` esistono solo come voci morte in sidebar (`sidebar.tsx:73-74`, link a route mai costruite) — nessun contenuto reale, per nessun partner. In parallelo, l'utente vuole dare ai prospect (record CRM in `prospects`, nessun account/login) una vetrina limitata dell'app — eventi selezionati + materiale formativo — da mandare come link personale, per scaldarli prima della conversione a cliente/partner.

I due bisogni sono legati: la vetrina prospect si appoggia sui contenuti di Formazione/Presentazioni, quindi si progettano insieme in un'unica spec, anche se l'implementazione può procedere a fasi (prima il sistema contenuti per i partner, poi il livello di accesso guest).

Oggi tutto è dietro login: il middleware (`src/lib/supabase/middleware.ts`) blocca ogni path tranne `/login`, `/auth`, `/invite`, `/registrati`, `/api/sponsor/*`, `/api/auth/signup`. La vetrina prospect introduce un nuovo varco pubblico, distinto dal flusso di registrazione esistente.

## Decisioni chiave

- **Scopo vetrina**: pagina generica (non legata a un singolo evento) che mostra eventi selezionati + contenuti formativi, non un flusso di iscrizione.
- **Link**: individuale per prospect (non lo slug fisso del partner), tracciabile (contatore visite, ultima apertura), scadenza 30 giorni, rigenerabile a mano dal partner (invalida il precedente).
- **Selezione contenuto visibile al prospect**: manuale, flag `visibile_prospect` sia su `events` che su `contenuti` — chi crea l'evento/contenuto decide caso per caso.
- **Gestione contenuti** (creazione/modifica/eliminazione): admin + qualifiche platino e superiori — stesso perimetro di chi crea eventi oggi (`canCreateEvent`).
- **Media**: link esterno (YouTube/Drive/PDF) o file caricato, con preview in-app (mai un redirect fuori dall'app). Per le Presentazioni l'upload resta permesso ma sconsigliato via UI (limite dimensione più basso + suggerimento di usare un link), perché tendono a essere file pesanti.
- **Tema**: campo testo libero con autocomplete sui temi già usati (endpoint dedicato), per permettere filtro senza forzare una tassonomia fissa né generare doppioni.
- **CTA vetrina**: bottone "Scrivimi su WhatsApp" verso il numero del partner (`profiles.telefono`, già esistente), messaggio precompilato.
- **Messaggi errore/avviso/successo**: nuovo componente condiviso `InlineMessage`, usato in tutte le superfici nuove di questa feature (non retrofit sui componenti esistenti — fuori scope).

## Data model — migration `015_contenuti_vetrina.sql`

```sql
-- Contenuti formazione/presentazioni
CREATE TABLE contenuti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('formazione','presentazione')),
  titolo TEXT NOT NULL,
  descrizione TEXT,
  tema TEXT,
  media_tipo TEXT NOT NULL CHECK (media_tipo IN ('link_esterno','file')),
  url_esterno TEXT,
  file_path TEXT,
  visibile_prospect BOOLEAN NOT NULL DEFAULT FALSE,
  creato_da UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contenuti_tipo ON contenuti(tipo);
CREATE INDEX idx_contenuti_tema ON contenuti(tema);

-- Eventi: riuso schema esistente
ALTER TABLE events ADD COLUMN IF NOT EXISTS visibile_prospect BOOLEAN NOT NULL DEFAULT FALSE;

-- Link vetrina individuale per prospect (una riga attiva per prospect)
CREATE TABLE prospect_preview_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL UNIQUE REFERENCES prospects(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  view_count INT NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`prospect_id UNIQUE` forza una sola riga attiva: "rigenera link" è un `UPSERT` (nuovo token + nuova scadenza sullo stesso record), il link condiviso in precedenza smette immediatamente di funzionare.

RLS: `contenuti` leggibile da tutti gli utenti autenticati, scrivibile solo da chi passa `canCreateEvent(ruolo, qualifica)` lato API (stesso pattern eventi: check applicativo con `createAdminClient()`, non policy RLS complesse). `prospect_preview_links` leggibile/scrivibile solo dal partner owner del prospect (via `partner_id` su `prospects`), oltre a `createAdminClient()` per la route pubblica.

## Storage — bucket `contenuti`

Bucket pubblico in lettura, scrittura ristretta a chi ha `canCreateEvent`. Stessa struttura RLS del bucket `avatars` (`012_impostazioni.sql`): path `{content_id}/file.ext`.

- Formazione: limite 50MB.
- Presentazioni: limite 15MB, con messaggio nella UI di upload che consiglia un link Drive/YouTube per file più pesanti.

## Permessi e route pubblica

- **Middleware**: aggiunta `/anteprima` a `isPublicPath` in `src/lib/supabase/middleware.ts`, stesso trattamento di `/invite`.
- **`canCreateEvent`** rinominato/riusato come helper condiviso (o alias) per il gate di scrittura su `contenuti` — nessuna nuova logica di ruolo da inventare.

## API

- `GET /api/contenuti?tipo=&tema=` — autenticato, lista contenuti per Formazione/Presentazioni lato partner (con filtro tema).
- `GET /api/contenuti/temi?tipo=` — autenticato, valori `tema` distinti già usati (per autocomplete form, evita doppioni tipo "Prodotto" vs "prodotti").
- `POST /api/contenuti`, `PATCH /api/contenuti/[id]`, `DELETE /api/contenuti/[id]` — gate `canCreateEvent`.
- `POST /api/contenuti/upload` — upload multipart nel bucket `contenuti`, limite dimensione dipendente da `tipo`.
- `POST /api/prospects/[id]/preview-link` — autenticato, solo partner owner del prospect: upsert token (uuid random) + `expires_at = now() + 30 giorni`, ritorna URL completo.
- `GET /api/anteprima/[token]` — **pubblica**, `createAdminClient()`:
  1. Cerca `prospect_preview_links` per token. Non trovato → 404. `expires_at < now()` → 410.
  2. Risolve `prospect_id → partner_id → profiles (nome, telefono)`.
  3. Query eventi con `visibile_prospect = true` scoperti tramite il gruppo/platino del partner (stessa logica di visibilità gruppo già usata in `events_read`).
  4. Query `contenuti` con `visibile_prospect = true`.
  5. Update fire-and-forget: `view_count + 1`, `last_viewed_at = now()`.
  6. Ritorna `{ partnerNome, partnerTelefono, eventi[], contenuti[] }`.

Tutte le route autenticate seguono la convenzione esistente: `supabase.auth.getUser()` prima, poi `createAdminClient()` per le letture/scritture che richiedono bypass RLS (stesso pattern documentato in CLAUDE.md per `getUserRole()`).

## UI

**`src/components/ui/inline-message.tsx`** (nuovo, condiviso): `<InlineMessage variant="error|warning|success|info">`, mappato sui token colore già in `globals.css` (`--coral`, `--warning`, `--success`, `--accent-glow`) — nessun nuovo colore, solo un contenitore standard riusato in ogni punto sotto.

**`/formazione` e `/presentazioni`** (nuove pagine, sidebar già punta lì): griglia di card filtrabile per tema (dropdown popolato da `GET /api/contenuti/temi`). Se `canCreateEvent`, bottone "+ Nuovo contenuto" apre modal: titolo, descrizione, tema (combobox con autocomplete), toggle link-esterno/file, campo url o uploader (con `InlineMessage` per errori validazione/dimensione), toggle `visibile_prospect`.

**Scheda prospect** (`/contatti/[id]`): nuovo bottone "Genera link vetrina" → chiama `POST /api/prospects/[id]/preview-link`, mostra risultato con copia + invio WhatsApp/email precompilati, riusando `buildWhatsappUrl`/`buildMailto` (`src/lib/prospects/links.ts`) e lo stile del blocco invito già in `convert-modal.tsx`.

**`/anteprima/[token]`** (nuova pagina pubblica):
- Header: "Ti ha invitato [Nome Partner]" (pattern `/invite/[slug]`).
- Filtro tema su formazione/presentazioni (dropdown "Tutti i temi" + valori presenti nel set ricevuto).
- Eventi: card sola lettura (nome, data, luogo) — nessuna iscrizione da qui.
- Contenuti: card cliccabili → player in modal:
  - `file`: tag `<video>` con URL pubblico dal bucket `contenuti`.
  - `link_esterno`: iframe embed (`youtube.com/embed/...`, Drive `/preview`) dentro il modal — il prospect non lascia mai il dominio.
- CTA fissa: "Scrivimi su WhatsApp" → `wa.me/<partnerTelefono>` con testo precompilato.
- Token non trovato/scaduto → `InlineMessage variant="warning"`: "Link non più valido, contatta chi te l'ha inviato".
- Player che non carica (iframe bloccato, file mancante) → `InlineMessage variant="error"`: "Contenuto non disponibile, riprova più tardi".

## Fuori scope

- Iscrizione a eventi dalla vetrina (resta sola lettura).
- Sostituzione dei `text-coral` ad-hoc esistenti nei componenti non toccati da questa feature con `InlineMessage` — miglioramento futuro possibile, non incluso qui.
- Notifiche al partner quando un prospect apre il link (solo contatore/ultima visita salvati, nessun invio email/push).
- Tassonomia fissa dei temi — resta testo libero con autocomplete.

## Testing

Nessuna suite automatica in questo progetto (verifica manuale via browser, come per le feature precedenti):

1. Creare contenuti di formazione/presentazione con temi diversi, verificare che il filtro tema funzioni su `/formazione`, `/presentazioni` e nella vetrina.
2. Marcare un evento e un contenuto come `visibile_prospect`, generare un link dalla scheda prospect, aprirlo in sessione incognita (non autenticata) e verificare che compaiano solo gli elementi marcati.
3. Verificare CTA WhatsApp apra `wa.me` con il numero corretto del partner.
4. Rigenerare il link e verificare che il vecchio token risponda 410.
5. Modificare a mano `expires_at` nel passato via SQL e verificare la pagina di errore.
6. Testare upload file oltre il limite (15MB su presentazione, 50MB su formazione) → `InlineMessage` errore corretto.
