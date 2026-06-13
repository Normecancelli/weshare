# WeShare — Riferimento progetto

Web app per la gestione delle attività del team Amway di **Alejerry (Alessandro Setten, qualifica diamante)**. Centralizza clienti, ordini, listino, eventi e formazione del gruppo di 79 partner su 10 livelli. **Brand**: "WeShare · powered by Me.To.Do for you®".

## Stack

- **Frontend**: Next.js 15 (App Router, TypeScript), Tailwind CSS v4, Recharts
- **Backend**: Supabase (PostgreSQL + Auth + RLS), Anthropic SDK (`claude-haiku-4-5` con prompt caching per WhatsApp AI parsing), SheetJS (parser Excel listino)
- **Deploy**: Vercel (Hobby plan), repo GitHub privato
- **Email**: Resend con SMTP custom su Supabase (dominio `growset.it` Verified)

## Ambiente

- **Repo**: https://github.com/Normecancelli/amway_partner_app — branch produzione `AMWAY.partner` (auto-redeploy ad ogni push)
- **Dominio**: https://metodo.growset.it (fallback `amway-partner-app.vercel.app`)
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

**Migration applicate**: `002_ordini_clienti.sql`, `003_customer_dates.sql`, `004_product_images.sql`, `005_signup_eventi.sql` (slug, platino_riferimento, preferenze_notifiche).

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

## Sessioni di lavoro (timeline)

- **2026-06-09**: Ordini Clienti Phase 1 completata, fix bug salva data, componenti icone, sidebar mobile, ricerca prodotti, parser listino, pagina dettaglio ordine, dashboard responsive, pannello promemoria
- **2026-06-10**: CRUD prodotti, role gate import, deploy iniziale, login+recovery+logout, modifica articoli ordine, WhatsApp AI base, OCR foto
- **2026-06-11**: Dominio `metodo.growset.it`, Resend SMTP, rebrand "Me.To.Do for you®", picker manuale per "non riconosciuti" Francesca AI, design Sessione A+B+C
- **2026-06-12**: ✅ **Sessione A completata** — signup flow end-to-end (`/invite/[slug]`, `/registrati`, `/benvenuto`), fix sanitizzazione slug Unicode

## Decisioni architetturali bloccate (per Sessione B + C)

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

1. **Sessione B**: CRUD eventi + pagine `/eventi` (lista, dettaglio, nuovo, RSVP) + migration 006
2. **Sessione C**: dashboard pannello eventi + banner urgente + sidebar badge + `/impostazioni` + modal QR personale
3. **Email reminder 24h** per eventi: cron Vercel + endpoint che scansiona event_attendees + invia via Resend (richiede Resend attivo, ✅ già pronto)
4. **Settings/Impostazioni**: pagina per il partner per modificare `codice_attivita`, `diamante_riferimento`, qualifica, preferenze notifiche
5. **Conferma pre-import listino** (~15 min): dialog "stai per sovrascrivere X prezzi e disattivare Y prodotti, mese rilevato: M". Endpoint preview-mode che parsa senza scrivere
6. **Modifica articoli ordine già confermato**: oggi non si può cambiare items di un ordine confermato. Da decidere se aprirlo per stato `confermato` o solo `bozza`
7. **Wa.me intelligenti templates**: oltre al pannello promemoria, aggiungere template per "follow-up cliente", "sollecito ordine programmato" (zero infra, manual click)
8. **OpenWA companion desktop** (rimandato): app desktop opt-in che gira sul Mac del partner, parla con la nostra API per template+contatti, usa OpenWA in locale per inviare. Modello distribuito = rischio per-utente

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
