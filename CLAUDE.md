# WeShare — Riferimento progetto

Web app per la gestione delle attività del team Amway di **Alejerry (Alessandro Setten, qualifica diamante)**. Centralizza clienti, ordini, listino, eventi e formazione del gruppo di 79 partner su 10 livelli. **Brand**: "WeShare · powered by Me.To.Do for you®".

## Stack

- **Frontend**: Next.js 15 (App Router, TypeScript), Tailwind CSS v4, Recharts
- **Backend**: Supabase (PostgreSQL + Auth + RLS), Anthropic SDK (`claude-haiku-4-5` con prompt caching per WhatsApp AI parsing), SheetJS (parser Excel listino)
- **Deploy**: Vercel (Hobby plan), repo GitHub privato
- **Email**: Resend con SMTP custom su Supabase (dominio `growset.it` Verified)

## Ambiente

- **Repo**: https://github.com/Normecancelli/weshare — branch produzione `weshare` (auto-redeploy ad ogni push)
- **Dominio**: https://weshare.growset.it (fallback `amway-partner-app.vercel.app`, vecchio `metodo.growset.it` ancora attivo in parallelo).
- **Supabase project**: `ietxuhkkahnvcbchfspt` (region `eu-central-1`)
  - Dashboard: https://supabase.com/dashboard/project/ietxuhkkahnvcbchfspt
  - SQL editor, Auth users, Storage tutti da lì
- **Vercel team**: `normecancelli_team`

### Account app principale

- **Alejerry**: `alessandro@iseven.it` (login app)
  - profile: nome=SETTEN ALESSANDRO, `ruolo=admin`, `qualifica=diamante`, `codice_amway='8044484'`, `invite_url_slug='8044484'`
- **Account secondari/test**: `alejerry@iseven.it` (vuoto, da eliminare). `normecancelli@gmail.com` è solo personale/GitHub, NON è un account app.

### Env vars (`.env.local` + Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://ietxuhkkahnvcbchfspt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<sb_publishable_*>
SUPABASE_SERVICE_ROLE_KEY=<sb_secret_*>      # serve per signup, mai esporre al client
SUPABASE_DB_URL=<postgres-conn-string>       # solo .env.local, non in Vercel
ANTHROPIC_API_KEY=<sk-ant-api03-*>           # per AI WhatsApp parser
```

## Modello di business

**Tool free per il team di Alejerry**, NON un SaaS. Alejerry copre l'infra (~€55/mese a regime: Vercel Pro + Supabase Pro + Anthropic API + Resend free tier + dominio) come investimento sulla sua leadership Amway. Niente fatturazione, subscription, Stripe. **Non costruire**: pricing, billing, trial, self-service signup pubblico.

## Architettura DB (riassunto)

Tabelle principali:

- `profiles` — estende `auth.users`. Campi chiave: `codice_amway`, `nome`, `ruolo` (enum `topadmin/admin/coadmin/incaricato/nuovo_iscritto/prospect`), `qualifica` (enum `nessuna/silver/gold/platino/smeraldo/diamante`), `sponsor_id`, `codice_sponsor`, `platino_riferimento_id`, `invite_url_slug` (UNIQUE), `preferenze_notifiche` (JSONB), `data_ingresso`, `profilo_completato`, `citta`, indirizzo, telefono, email
- `customers` — clienti finali del partner. `partner_id` collega al profile owner
- `customer_dates` — promemoria ricorrenti (compleanno, anniversario, ecc.)
- `products` — catalogo Amway 257 prodotti, `image_url` opzionale, `attivo` per soft-delete
- `client_orders` + `client_order_items` — ordini cliente con item snapshot di prezzi/VP/provvigione (storico immutabile anche se il listino cambia)
- `order_groups` + `group_items` — raggruppamento ordini su 3 carrelli (`personale max 510 VP / non_registrato / programmato`)
- `imports` + `monthly_data` — dati mensili Amway importati partner-per-partner (file `partner_DDMMYYYY.xlsx`)
- `column_mappings` — mapping header Excel → campi interni (configurabile)
- `coadmin_flags` + `system_flags` — feature flag granulari

**Migration applicate**: `002_ordini_clienti.sql`, `003_customer_dates.sql`, `004_product_images.sql`, `005_signup_eventi.sql` (slug, platino_riferimento, preferenze_notifiche), `007_prospects.sql` (pipeline contatti/lead), `008_prospect_appointments_messages.sql` (appuntamenti, messaggi, follow-up flag).

**Storico ordini protetto**: ogni `client_order_items` salva `prezzo_unitario_cliente`, `prezzo_unitario_partner`, `punti_vp`, `provvigione` al momento dell'ordine. Importare un nuovo listino non altera lo storico.

## Feature in produzione (cosa funziona)

### Auth
- Login email+password (Supabase). Sidebar footer mostra email + bottone "Esci"
- Recovery password via `/login` → "Password dimenticata?" → mail con link → `/auth/update-password`
- **Signup pubblico** via link sponsor: `/invite/[slug]` → `/registrati?sponsor=[slug]` → auto-login → `/benvenuto` (tour 4 step + form info aggiuntive)
- `[slug]` = `codice_amway` del partner (es. 8044484). Sanitizzato server+client per resistere a U+2028 da copy-paste WhatsApp
- Già loggato + click invito → warning, no azioni magiche

### Clienti
- CRUD completo, modal `clienti/page.tsx` con form, gestione `customer_dates` inline (auto-flush della data pendente al click "Salva")
- Card cliente con bottone WhatsApp (`wa.me`) tappabile e icona matita per modifica
- Pannello dashboard "Date in arrivo" con next 60 giorni, badge urgenza colorato, bottone WA precompilato (template compleanno/anniversario/onomastico)

### Contatti / Prospect (pipeline lead)
- CRUD prospect su `/contatti` (tabella `prospects`, RLS `partner_id`)
- Campi: nome, telefono, email, città, source (contatto_personale/lista/social/referenza/altro), note
- Stato pipeline: nuovo_contatto → primo_appt → secondo_appt → convertito_cliente/convertito_partner/follow_up
- Follow-up con sub-tag (interessato_non_ora/necessita_info/ha_detto_no/custom) + cadenza giorni + prossima_data_reminder
- Vista desktop tabella + mobile card, filtri per stato + ricerca
- **Detail page** `/contatti/[id]`: edit info/pipeline + appuntamenti + messaggi recenti
- **Appuntamenti** (`prospect_appointments`): titolo, data/ora, durata, luogo, note + link "Aggiungi a Google Calendar" (URL prefillato, no OAuth — colonne `google_event_id`/`google_sync_status` riservate per sync futura)
- **Messaggi follow-up**: template email/WhatsApp prefillati via `mailto:`/`wa.me` (no invio automatico), loggati in `prospect_messages`; ogni invio sposta `prossima_data_reminder` di `cadenza_giorni`
- **Follow-up worklist** `/contatti/follow-up`: flag triage (da_valutare/inviare/non_inviare/sospeso) + bottoni invio
- **Conversione**: pulsante "Converti" sulla detail page → a Cliente (crea `customers` row prefillata, link `prospects.customer_id`) o a Partner (mostra il link invito `/invite/[slug]` del partner da condividere via copia/email/WhatsApp). Stato → `convertito_cliente`/`convertito_partner`, `data_conversione` salvata. Guard anti-doppia-conversione.
- **Analytics** `/contatti/analytics`: pipeline (barre per stato) + metriche conversione (% cliente, % partner, tempo medio gg, trend mese su mese). Isolato per partner.

### Prodotti
- Catalogo 257 prodotti (`PriceList_April-2026_IT.xlsx`), ricerca multi-parola su descrizione+codice
- Vista desktop = tabella spreadsheet, vista mobile = card. CRUD admin-only (`+ Nuovo prodotto`, edit, delete con soft-delete intelligente se referenziato da ordini)
- "+ Carica" da catalogo → modal customer picker → add-or-update bozza ordine
- Thumbnail (`image_url`, placeholder SVG se assente)
- Parser dual-layout: gestisce sia righe standard (codice in col B) sia shiftate (codice in col A), zero-padding da `cell.w` (recupera codici tipo `0001` Amway L.O.C.)

### Ordini Clienti
- Lista (tab tutti/bozza/confermato/completato) con stats
- Pagina dettaglio `/ordini-clienti/[id]`: cliente, canale, articoli (qty editabili con stepper, rimuovi), totali in tempo reale, stati (bozza→confermato→completato/annullato), elimina (solo bozza/annullato)
- Nuovo ordine: cliente picker (con quick-add), canale, ricerca prodotti, carrello con qty stepper, note

### WhatsApp Extractor AI (Francesca AI)
- Pannello visibile quando `canale === 'whatsapp'` su `/ordini-clienti/nuovo` e `/ordini-clienti/[id]` (bozze)
- Input: testo OPPURE immagine (JPG/PNG/GIF/WEBP, max 5MB) OPPURE entrambi
- Modello: `claude-haiku-4-5` con prompt caching del catalogo (costo ~$0.0005/chiamata da seconda volta, ~$0.001-0.003 con immagine). Tool schema forza output JSON con `matches[]` + `unmatched[]`
- Gestisce sinonimi italiano/inglese (es. "S8 All fabric bleach" = SA8 Smacchiante), quantità in lettere, ambiguità con confidence colorata
- Chip "Non riconosciuto" cliccabili → apre `ProductPickerModal` con catalogo prefiltrato per il termine non capito → click prodotto → aggiunge a matches con confidence "alta"

### Import dati mensili (Amway file)
- Pagina `/import` accessibile a tutti i partner (ognuno importa il PROPRIO file mensile)
- Salva in `monthly_data` per costruire la dashboard performance

### Import listino prodotti
- Pagina `/prodotti/import` admin-only (role gate)
- API `POST /api/products/import` admin-only (gate via `isAdminRole` su `profiles.ruolo`)
- Parser legge file `PriceList_*.xlsx`, UPSERT su `codice_amway`, disattiva i prodotti non presenti nel file (preserva storico)

### Dashboard
- Stat cards responsive (`grid-cols-2 lg:grid-cols-4`), content stack su `<lg`
- Pannello "Date in arrivo" da `customer_dates`
- VPG trend, top downline (da `monthly_data` se importato)

### Branding
- Icona app ufficiale generata dal logo WeShare (asset sorgente `docs/Weshare_icon_clipboard.png`, 500×500): `src/app/favicon.ico` (32×32, tab browser), `src/app/icon.png` (256×256, convenzione file Next.js), `src/app/apple-icon.png` (180×180, home screen iOS). Nessuna configurazione manuale in `layout.tsx` richiesta — Next.js le rileva ed espone automaticamente come `<link rel="icon">`/`apple-touch-icon`.

### Eventi
- CRUD eventi, pagina `/eventi` (tab Attivi/Storico, filtri, dettaglio, RSVP `confermato/forse/annullato`)
- **AI genera titolo+descrizione** (`event-form.tsx`, modale "✨ Genera con AI"): `claude-haiku-4-5`, 3 varianti di tono da un'idea testuale breve. Tetto 5 generazioni gratuite a vita/utente, oltre serve chiave Anthropic personale (sezione Impostazioni)
- **Reminder automatici a soglia** (7gg/1gg/2h prima), destinatari unificati partner (`event_attendees`) + prospect (`event_prospect_bookings`). Trigger: workflow GitHub Actions ogni 15 min (`.github/workflows/event-reminders.yml`), non cron Vercel nativo (piano Hobby = max 1 esecuzione/giorno, incompatibile con la cadenza 2h). Bottone manuale "Invia reminder" nel dettaglio evento usa la stessa logica

### Prenotazione eventi (prospect)
- Prospect senza account possono prenotarsi a un evento via link pubblico per-evento o dalla vetrina personale `/anteprima/[token]`
- Lista iscritti unificata partner+prospect nel dettaglio evento, gestione capienza/lista d'attesa, email di conferma immediata (Resend)

### Formazione / Presentazioni (contenuti)
- `/formazione` e `/presentazioni`: libreria contenuti (`contenuti`), tema testo libero con autocomplete, icona per tema assegnata al volo nel form (set curato `lucide-react`, stesso ambito ovunque compaia il tema)
- **Vetrina prospect** `/anteprima/[token]`: pagina pubblica (no login) con eventi + contenuti selezionati (`visibile_prospect`), link individuale per prospect, scadenza 30gg, rigenerabile, tracciato (visite/ultima apertura)

### QR/Link acquisizione contatti
- `/contatto/[slug]` (slug = `invite_url_slug` del partner, fisso, non scade): mini-form pubblico (nome, cognome, telefono, email) che crea/aggiorna la scheda `prospects` da solo, poi redirect alla vetrina `/anteprima/[token]`. Distinto da `/invite/[slug]` (reclutamento partner)

### Ricevuta ordine (PDF + email + WhatsApp)
- Sezione "Ricevuta" su `/ordini-clienti/[id]` (qualunque stato ordine): **Scarica PDF** (`GET /api/client-orders/[id]/receipt`, `@react-pdf/renderer`, senza VP/provvigioni), **Invia email** (`POST .../receipt/send-email`, Resend, richiede email cliente in anagrafica), **WhatsApp** (scarica PDF + apre `wa.me` precompilato, allegato manuale — no invio automatico)
- **Numerazione progressiva** per partner+anno (`numero_ricevuta`, es. `2026-001`), assegnata alla prima conferma ordine, persistente se torna in bozza e viene riconfermata, non retroattiva sugli ordini già confermati prima della migration (mantengono il vecchio codice derivato dall'UUID). Ordini mai confermati mostrano "BOZZA — non ancora confermato". Funzione atomica `next_receipt_number()` (migration `021_ricevute_numerazione_storico.sql`)
- **Storico invii email** loggato in `receipt_email_log` (un insert per invio riuscito, non per tentativo — unico canale con conferma reale di invio, a differenza di PDF/WhatsApp)
- Invio resta manuale per scelta (no auto-send alla conferma ordine) — decisione presa, non un gap

### Impostazioni
- `/impostazioni`: foto profilo (bucket `avatars`, resize client-side 512×512), dati personali, profilo Amway (codice_amway read-only, qualifica, platino/diamante di riferimento), notifiche email, account (cambio password, logout)
- Sezione chiave AI personale: campo per la propria `ANTHROPIC_API_KEY`, usata oltre il tetto gratuito di 5 generazioni AI eventi

## Sessioni di lavoro (timeline)

- **2026-06-09**: Ordini Clienti Phase 1 completata, fix bug salva data, componenti icone, sidebar mobile, ricerca prodotti, parser listino, pagina dettaglio ordine, dashboard responsive, pannello promemoria
- **2026-06-10**: CRUD prodotti, role gate import, deploy iniziale, login+recovery+logout, modifica articoli ordine, WhatsApp AI base, OCR foto
- **2026-06-11**: Dominio `metodo.growset.it`, Resend SMTP, rebrand "Me.To.Do for you®", picker manuale per "non riconosciuti" Francesca AI, design Sessione A+B+C
- **2026-06-12**: ✅ **Sessione A completata** — signup flow end-to-end (`/invite/[slug]`, `/registrati`, `/benvenuto`), fix sanitizzazione slug Unicode
- **2026-06-20/21**: Contatti/Prospect Fase 1+2+3 completate (CRUD pipeline, appuntamenti+Google Calendar link, email/WhatsApp template, follow-up worklist, conversione cliente/partner, analytics)
- **2026-06-21**: Icona app ufficiale (favicon, icon.png, apple-icon.png) da logo WeShare
- **2026-07-01**: Sessione B Eventi in produzione (CRUD, `/eventi`, RSVP, migration eventi)
- **2026-07-16**: AI genera titolo+descrizione evento; pagina Impostazioni + chiave AI personale costruita (mai fatto prima, nonostante lo spec fosse pronto da giugno)
- **2026-07-17**: Formazione/Presentazioni (contenuti) + Vetrina prospect `/anteprima/[token]`; icone per tema
- **2026-07-18**: QR/link fisso acquisizione contatti `/contatto/[slug]`
- **2026-07-19**: Ricevuta ordine PDF + invio email (Resend) + WhatsApp
- **2026-07-20/21**: Prenotazione eventi per prospect senza account; reminder eventi esteso a 3 soglie (7gg/1gg/2h) via GitHub Actions, sostituendo il cron nativo Vercel (piano Hobby, limite 1 esecuzione/giorno)

## Decisioni architetturali bloccate (per Sessione B + C)

**Nota**: le decisioni sotto sono lo storico di come Sessione B (Eventi) e C sono state progettate — entrambe già costruite (vedi timeline sopra). Sezione mantenuta come riferimento architetturale, non come lavoro da fare.

### Registrazione
- Link generico per sponsor `/invite/[slug]`, slug = `codice_amway`
- Qualifica auto-dichiarata in registrazione (no auto-derivazione upline) → semplifica
- Form: nome, cognome, email, password, cellulare, codice Amway (opz), qualifica dropdown, data ingresso (default oggi), platino autocomplete, indirizzo, città
- Email confirmation: codice pronto, attivabile da Supabase dashboard quando si vuole
- Tour benvenuto 4 step + form info aggiuntive

### Eventi (Sessione B prossima)
- Scope MVP: campi base + RSVP, NO allegati/commenti
- Campi: nome, descrizione, data_inizio/fine, location, location_url, modalita (presenza/online/hybrid), capienza_max, prezzo, link_prenotazione, link_evento (Zoom/Meet), locandina_url, visibilita (`globale|gruppo`), `platino_id` se gruppo
- Possono creare: admin, topadmin, diamante, platino
- Visibilità: scelta "globale" (tutti) o "gruppo" (membri stesso platino)
- Reminder: solo email 24h (Resend) + banner urgente dashboard < 24h. **NO WhatsApp automatico** (OpenWA = ban risk)
- Pagina `/eventi` con tab Attivi/Storico + filtri + dettaglio + RSVP (`confermato/forse/annullato`)

### Schema DB Sessione B (migration 006 da scrivere)
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descrizione TEXT,
  data_inizio TIMESTAMPTZ NOT NULL,
  data_fine TIMESTAMPTZ,
  location TEXT, location_url TEXT,
  modalita TEXT CHECK (modalita IN ('presenza','online','hybrid')),
  capienza_max INT,
  prezzo NUMERIC(10,2),
  link_prenotazione TEXT, link_evento TEXT, locandina_url TEXT,
  visibilita TEXT NOT NULL CHECK (visibilita IN ('globale','gruppo')) DEFAULT 'gruppo',
  platino_id UUID REFERENCES profiles(id),
  creato_da UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE event_attendees (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  stato TEXT CHECK (stato IN ('confermato','forse','annullato')) DEFAULT 'confermato',
  responded_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
-- RLS: events_read (gruppo del platino del lettore o globale),
--      events_write (creato_da = auth.uid() o admin/topadmin),
--      attendees solo proprio record
```

## TODO aperti

_Aggiornato 2026-09-02 — mappa Wayfinder "allineamento repo e documentazione" (issue #3) chiusa: numerazione ricevute + storico invii risultavano già implementati (migration 021, commit `5a2099b`), lista corretta di conseguenza._

1. **Conferma pre-import listino** (~15 min): dialog "stai per sovrascrivere X prezzi e disattivare Y prodotti, mese rilevato: M". Endpoint preview-mode che parsa senza scrivere
2. **Modifica articoli ordine già confermato**: oggi non si può cambiare items di un ordine confermato. Da decidere se aprirlo per stato `confermato` o solo `bozza`
3. **Wa.me intelligenti templates**: oltre al pannello promemoria, aggiungere template per "follow-up cliente", "sollecito ordine programmato" (zero infra, manual click)
4. **OpenWA companion desktop** (rimandato): app desktop opt-in che gira sul Mac del partner, parla con la nostra API per template+contatti, usa OpenWA in locale per inviare. Modello distribuito = rischio per-utente

**Fuori scope / backlog separato**: debito lint pre-esistente (21 errori, in gran parte regola `react-hooks/set-state-in-effect` su codice funzionante) — non bloccante, da affrontare in un effort dedicato.

## Convenzioni di codice

- **`use client`** in cima a tutti i componenti interattivi (form, modal, panel con state)
- **API routes** in `src/app/api/*/route.ts`, sempre verifica `supabase.auth.getUser()` PRIMA della logica
- **Service-role client** (`createAdminClient()` in `src/lib/supabase/admin.ts`) solo per signup, admin tasks. Mai esporre `SUPABASE_SERVICE_ROLE_KEY` al client
- **Role gate**: usa `getUserRole()` + `isAdminRole()` da `src/lib/auth/roles.ts`
- **Slug sanitization**: usa `sanitizeSlug()` da `src/lib/auth/slug.ts` su qualsiasi slug user-controlled
- **RLS Supabase**: ogni tabella ha policy `*_own` filtrate su `auth.uid()` o relazione transitiva (es. `customer_dates` filtrato via `customers.partner_id`)
- **Italian locale**: numeri con `.toLocaleString('it-IT')`, date con `.toLocaleDateString('it-IT')`. Numeri italiani usano `,` per decimali — attenzione al wrap (`whitespace-nowrap` sui valori).
- **Componenti icone**: usa `EditIcon`/`TrashIcon`/`MessageIcon`/`RowActions` da `src/components/icons.tsx`. NON usare emoji come icone funzionali.
- **Mobile-first responsive**: ogni pagina lista deve avere card su mobile + tabella spreadsheet su `md+`

## Cosa NON fare

- Non commit `.env.local` (è in `.gitignore`)
- Non hardcodare email/codici Amway nei test — usa l'account `alessandro@iseven.it`
- Non chiamare Anthropic API senza prompt caching del catalogo (esplode il costo)
- Non rimuovere il check `isAdminRole` su endpoint admin
- Non usare `display: none` per nascondere su mobile — usa Tailwind `hidden md:block`
- Non costruire pricing/billing — il modello è free per il team

---

## Agent skills

### Issue tracker

Issue tracciate su GitHub Issues (`github.com/Normecancelli/weshare`), via CLI `gh`. Vedi `docs/agents/issue-tracker.md`.

### Triage labels

Etichette canoniche predefinite (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Vedi `docs/agents/triage-labels.md`.

### Domain docs

Layout single-context (`CONTEXT.md` + `docs/adr/` alla radice, non ancora creati). Vedi `docs/agents/domain.md`.
