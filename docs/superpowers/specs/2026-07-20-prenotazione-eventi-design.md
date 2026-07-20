# Pagina di prenotazione eventi (prospect) — Design

## Contesto

Oggi solo i partner loggati possono dare l'RSVP a un evento (`event_attendees`, `POST /api/events/[id]/rsvp`), perché la tabella richiede `user_id NOT NULL` legato a `profiles`. I prospect vedono gli eventi solo in lettura nella vetrina pubblica `/anteprima/[token]` (`visibile_prospect = true`), senza poter prenotarsi.

Questo spec introduce la possibilità per un **prospect senza account** di prenotarsi a un evento, attraverso due punti d'ingresso:

1. La vetrina personale già esistente `/anteprima/[token]` (prospect già noto).
2. Un nuovo **link pubblico per evento**, generabile dal partner (es. per QR/volantino), che chiunque può aprire anche senza essere già un prospect conosciuto.

Reminder 24h/2h e inclusione dei prospect nel sistema di reminder esistente sono **esplicitamente fuori scope** — restano un progetto separato futuro. L'unica email di questo spec è la conferma immediata alla prenotazione.

## Decisioni chiave

- **Tabella separata `event_prospect_bookings`**, non estensione di `event_attendees`. `event_attendees` è già in produzione con RLS e RSVP partner funzionanti; una tabella nuova isola completamente il rischio del nuovo flusso dal flusso esistente. Il costo (unire due fonti per lista/conteggio) è accettabile e contenuto in un helper unico.
- **Capienza con lista d'attesa**: alla prenotazione si contano i confermati totali (`event_attendees.stato='confermato'` + `event_prospect_bookings.stato='confermato'`) contro `capienza_max`. Se pieno, la riga viene comunque salvata con `stato='in_attesa'` — nessun blocco, il partner gestisce manualmente chi promuovere.
- **Dedup prospect scoped per partner**, stesso principio già usato in `/api/contatto/[slug]`: match su telefono o email dentro `partner_id`, mai cross-partner. Logica estratta in helper condiviso `src/lib/prospects/find-or-create.ts` (oggi duplicata solo dentro `/api/contatto/[slug]`), riusato dai due nuovi endpoint di prenotazione.
- **Link pubblico per evento**: nuova tabella `event_booking_links` (`event_id`, `partner_id`, `token`), generato on-demand dal partner dalla pagina dettaglio evento, non scade (a differenza del link vetrina 30gg — un evento ha una data fissa, dopo quella non serve più). Un solo link per coppia `(event, partner)`: se il partner lo rigenera, riusa la stessa riga.
- **Due endpoint pubblici, stesso helper**: `POST /api/prenota/[token]` (token = `event_booking_links`) e `POST /api/anteprima/[token]/eventi/[eventId]/prenota` (token = `prospect_preview_links`, prospect già noto → niente creazione, solo eventuale aggiornamento dati + booking). Entrambi delegano a `src/lib/events/prenotazione.ts` (crea/aggiorna prospect, calcola stato confermato/in_attesa, inserisce booking, invia email).
- **Email di conferma immediata**: se il prospect ha lasciato l'email, invio via Resend con un template dedicato (non il template reminder esistente — quello ha una CTA verso la dashboard autenticata, qui non applicabile). Nessun invio se il prospect ha lasciato solo il telefono.
- **Lista iscritti organizzatore**: chi già vede la lista (organizzatore/admin/qualifica alta, gate `canViewAttendeesList` esistente) vede TUTTI gli iscritti — partner + prospect uniti — con badge "in lista d'attesa" per gli stati `in_attesa`, e per ogni riga prospect il **nome del partner di riferimento** (`prospects.partner_id → profiles.nome`). Nessun filtro per-partner: chi vede la lista la vede intera, come già oggi per gli iscritti partner.
- **Anti-abuso**: stesso pattern honeypot + validazione minima già usato in `/api/contatto/[slug]`, nessun rate-limiting dedicato (link condiviso a mano/QR, non endpoint esposto a scraping).

## Data model — migration `018_prenotazione_eventi.sql`

```sql
CREATE TABLE public.event_booking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  view_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, partner_id)
);

CREATE TABLE public.event_prospect_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  stato TEXT NOT NULL CHECK (stato IN ('confermato','in_attesa','annullato')) DEFAULT 'confermato',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, prospect_id)
);

-- Solo accesso via service role (createAdminClient): niente sessione utente
-- coinvolta in nessuno dei due flussi (link pubblico o vetrina prospect).
ALTER TABLE public.event_booking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_prospect_bookings ENABLE ROW LEVEL SECURITY;
-- Nessuna policy: RLS attiva senza policy = nessun accesso per authenticated/anon,
-- solo service role (bypassa RLS). Stesso pattern già usato altrove nel progetto
-- per tabelle lette/scritte solo da endpoint admin-client.

ALTER TABLE prospects DROP CONSTRAINT prospects_source_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_source_check
  CHECK (source IN ('contatto_personale', 'lista', 'social', 'referenza', 'altro', 'qr_link', 'prenotazione_evento'));
```

Nota di verifica in fase di implementazione: confermare con `\d prospects` / `\d events` i nomi reali dei vincoli prima di applicare (stessa cautela già presa nello spec QR contatti, dato il drift schema-vs-file già riscontrato in passato).

## API

- `POST /api/prenota/[token]` — **pubblica**, `createAdminClient()`. Body: `nome, cognome, telefono, email, honeypot`.
  1. Risolve `event_booking_links` per `token` → `event_id`, `partner_id`. Non trovato → 404.
  2. Valida: `nome` obbligatorio, almeno uno tra `telefono`/`email`, honeypot vuoto (se valorizzato → 200 silenzioso, nessuna scrittura).
  3. `findOrCreateProspect(admin, partnerId, { nome, telefono, email, source: 'prenotazione_evento' })` → richiede estendere il CHECK `prospects_source_check` con il nuovo valore `prenotazione_evento`.
  4. Chiama helper condiviso `prenotaEvento(admin, eventId, prospectId)`: conta confermati (`event_attendees` + `event_prospect_bookings`), confronta con `capienza_max` (`null` = illimitato), upsert su `event_prospect_bookings` con `stato` risultante.
  5. Se `email` presente, invia email conferma (`buildBookingConfirmationEmail`).
  6. Ritorna `{ stato: 'confermato' | 'in_attesa', evento: {...} }` per la schermata di conferma.
- `GET /api/prenota/[token]` — **pubblica**: dettaglio evento completo (nome, descrizione, data, location, locandina, prezzo, posti rimasti) + nome partner, per popolare la pagina prima del submit. 404 se link non trovato o evento già passato (`data_inizio < now()`). Incrementa `view_count` fire-and-forget, stesso pattern già usato in `GET /api/anteprima/[token]`.
- `POST /api/anteprima/[token]/eventi/[eventId]/prenota` — **pubblica**, stesso schema body ma prospect già risolto da `prospect_preview_links → prospect_id` (nessuna dedup, solo eventuale update di telefono/email se il form li ha modificati). Verifica che l'evento sia effettivamente tra quelli `visibile_prospect=true` e visibile a quel prospect (stessa logica replicata già presente in `GET /api/anteprima/[token]`). Poi stesso `prenotaEvento(...)` + email.
- `POST /api/events/[id]/booking-link` — **autenticata**, solo per chi ha `canManage` sull'evento (organizzatore/admin): crea (o ritorna se già esiste, `upsert` su `(event_id, partner_id)`) la riga `event_booking_links` per il partner loggato, ritorna `{ url }`.
- `GET /api/events/[id]/attendees` (esistente, da estendere): oltre a `event_attendees`, join `event_prospect_bookings → prospects → profiles (partner_id)`, ritorna righe unificate con un campo `tipo: 'partner' | 'prospect'` e, per i prospect, `partner_nome`. Il conteggio `confermati` somma entrambe le fonti.

## Email di conferma

Nuovo template dedicato in `src/lib/events/email.ts` (`buildBookingConfirmationEmail`), variante semplificata di `DEFAULT_EMAIL_TEMPLATE`: stessa identità visiva (header WeShare, locandina, data/ora/location), ma:
- Subject: `Prenotazione confermata: {nome_evento}` oppure `In lista d'attesa: {nome_evento}` a seconda dello stato.
- Nessun CTA "Vedi dettagli evento" verso la dashboard (il prospect non ha accesso) — CTA opzionale verso `link_evento` (Zoom/Meet) se presente, altrimenti nessun bottone.
- Corpo breve: conferma stato + data/ora/location, eventuale nota se in lista d'attesa ("ti contatteremo se si libera un posto").

## Middleware

Aggiungere a `isPublicPath` in `src/lib/supabase/middleware.ts`:
`path.startsWith("/prenota")`, `path.startsWith("/api/prenota/")`. Le rotte `/anteprima` e `/api/anteprima/` sono già pubbliche.

## UI

**`/prenota/[token]`** (nuova pagina pubblica): fetch `GET /api/prenota/[token]` al mount. Header con locandina/nome evento/data/location (stesso stile della card evento in dettaglio dashboard, versione read-only), indicatore posti rimasti se `capienza_max` impostata, form nome/cognome/telefono/email + honeypot. Submit → stato di conferma inline (✅ confermato / ⏳ in lista d'attesa), nessun redirect. Evento non trovato o già passato → messaggio ("Evento non disponibile"), stesso stile delle altre pagine pubbliche del progetto.

**`/anteprima/[token]`**: ogni evento nella lista guadagna un bottone "Prenota il tuo posto" → naviga a `/anteprima/[token]/eventi/[eventId]` (nuova sotto-pagina, stesso form del punto sopra ma senza richiedere nome/telefono/email da zero: precompilati dal prospect già noto, restano editabili).

**Dettaglio evento dashboard** (`src/app/(dashboard)/eventi/[id]/page.tsx`, la pagina già in discussione in questa sessione):
- Bottone "Genera link prenotazione pubblico" accanto agli altri controlli organizzatore (`canManage`), apre modal con URL + copia + QR (riuso `<ContactQrCard>`-style, o componente dedicato che ne condivide la logica QR).
- Sezione iscritti: badge "in lista d'attesa" per righe con `stato='in_attesa'`, colonna/etichetta partner di riferimento per le righe prospect.
- Contatore posti aggiornato con la fonte unificata.

## Fuori scope

- Reminder 24h/2h e inclusione prospect nel sistema reminder esistente — progetto separato futuro.
- Promozione automatica da lista d'attesa a confermato quando si libera un posto (es. per annullamento) — gestione manuale del partner per ora.
- Rate-limiting/captcha visibile.
- Notifica al partner (in-app/email) quando arriva una nuova prenotazione — resta da controllare manualmente nella lista iscritti.
- Modifica/cancellazione della propria prenotazione da parte del prospect dopo il submit (nessun'area riservata prospect).

## Testing

Nessuna suite automatica nel progetto (verifica manuale via browser):

1. Da dettaglio evento (organizzatore), generare il link prenotazione pubblico, verificare che riaprendo la generazione ritorni lo stesso URL (upsert, non duplica).
2. Aprire `/prenota/[token]` in incognito, compilare il form → verificare stato confermato a schermo, prospect creato in `/contatti` del partner giusto con `source='prenotazione_evento'`, email di conferma ricevuta.
3. Ripetere il submit con stesso telefono → aggiorna il prospect esistente, non duplica; verificare che comunque venga gestita la seconda prenotazione sullo stesso evento (`UNIQUE (event_id, prospect_id)` → nessun duplicato in `event_prospect_bookings`, stato aggiornato se necessario).
4. Impostare `capienza_max` basso, prenotare oltre il limite → verificare stato "in lista d'attesa" a schermo e nell'email, badge corretto nella lista organizzatore.
5. Dalla vetrina `/anteprima/[token]` di un prospect esistente, prenotarsi a un evento → verificare nessuna duplicazione del prospect, booking registrato.
6. Honeypot valorizzato via devtools → nessuna scrittura.
7. Link con evento già passato → pagina "Evento non disponibile".
8. Lista iscritti organizzatore mostra correttamente partner + prospect uniti, con nome partner di riferimento sulle righe prospect, e il conteggio posti include entrambe le fonti.
