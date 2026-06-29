# Sessione B — Gestione Eventi (Design Spec)

**Data**: 2026-06-29
**Scope**: CRUD eventi, RSVP, lista iscritti, upload locandina, email reminder 24h via Vercel Cron + Resend.

---

## Requisiti confermati

- **Locandina**: upload su Supabase Storage (bucket `event-covers`), resize client-side a max 1200px con Canvas API
- **RSVP**: registrazione semplice (confermato/forse/annullato), pagamento fuori app. Il creatore/platino vede la lista iscritti.
- **Visibilità "gruppo"**: platini vedono eventi del proprio gruppo + globali. Diamanti/admin/topadmin vedono tutto.
- **Email reminder**: Vercel Cron ogni mattina alle 07:00 UTC (09:00 CEST) — manda email Resend a tutti gli iscritti confermati degli eventi del giorno successivo.
- **Design**: Ocean Pro tokens esistenti, icone Lucide `strokeWidth={1.75}`, mobile-first (card mobile + tabella desktop).

---

## 1. DB & Migration

**File**: `supabase/migrations/006_eventi.sql`

```sql
-- events (già presente in Supabase, IF NOT EXISTS per sicurezza)
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descrizione TEXT,
  data_inizio TIMESTAMPTZ NOT NULL,
  data_fine TIMESTAMPTZ,
  location TEXT,
  location_url TEXT,
  modalita TEXT CHECK (modalita IN ('presenza','online','hybrid')),
  capienza_max INT,
  prezzo NUMERIC(10,2),
  link_prenotazione TEXT,
  link_evento TEXT,
  locandina_url TEXT,
  visibilita TEXT NOT NULL CHECK (visibilita IN ('globale','gruppo')) DEFAULT 'gruppo',
  platino_id UUID REFERENCES public.profiles(id),
  creato_da UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aggiungi colonne se non esistono già
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS locandina_url TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS testo_reminder TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS reminder_sent_7d BOOLEAN DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS reminder_sent_1d BOOLEAN DEFAULT false;

-- event_attendees
CREATE TABLE IF NOT EXISTS public.event_attendees (
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  stato TEXT CHECK (stato IN ('confermato','forse','annullato')) DEFAULT 'confermato',
  responded_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- RLS events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- SELECT: globali → tutti; gruppo → stesso platino_id o ruolo diamante+
CREATE POLICY events_read ON public.events FOR SELECT TO authenticated
  USING (
    visibilita = 'globale'
    OR creato_da = auth.uid()
    OR (
      visibilita = 'gruppo'
      AND (
        platino_id IN (
          SELECT platino_riferimento_id FROM public.profiles WHERE id = auth.uid()
        )
        OR public.get_user_role() IN ('admin','topadmin','diamante')
      )
    )
  );

-- INSERT: ruoli abilitati
CREATE POLICY events_insert ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    creato_da = auth.uid()
    AND public.get_user_role() IN ('admin','topadmin','diamante','platino')
  );

-- UPDATE/DELETE: creatore o admin
CREATE POLICY events_update ON public.events FOR UPDATE TO authenticated
  USING (creato_da = auth.uid() OR public.get_user_role() IN ('admin','topadmin'));

CREATE POLICY events_delete ON public.events FOR DELETE TO authenticated
  USING (creato_da = auth.uid() OR public.get_user_role() IN ('admin','topadmin'));

-- RLS event_attendees
ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;

-- Ogni utente gestisce solo il proprio record
CREATE POLICY attendees_own ON public.event_attendees FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Il creatore dell'evento + admin/topadmin/diamante possono leggere tutti gli iscritti
CREATE POLICY attendees_read_organizer ON public.event_attendees FOR SELECT TO authenticated
  USING (
    event_id IN (SELECT id FROM public.events WHERE creato_da = auth.uid())
    OR public.get_user_role() IN ('admin','topadmin','diamante')
  );

-- Trigger updated_at
CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

**Storage bucket** (via Supabase dashboard o SQL):
- Nome: `event-covers`
- Pubblico in lettura (GET senza auth)
- Upload: solo utenti autenticati con ruolo ≥ platino
- Path: `{event_id}/cover.jpg`

**Nota migration**: la migration 006 per `/impostazioni` (profiles.foto_url, cap, codice_attivita, diamante_riferimento_id) diventa **009** per evitare conflitti.

---

## 2. API Routes

Tutte in `src/app/api/events/`, sempre `supabase.auth.getUser()` prima della logica.

| Endpoint | Metodo | Descrizione |
|---|---|---|
| `/api/events` | GET | Lista eventi visibili all'utente (filtro RLS) |
| `/api/events` | POST | Crea evento (ruoli: admin/topadmin/diamante/platino) |
| `/api/events/[id]` | GET | Dettaglio evento |
| `/api/events/[id]` | PATCH | Modifica (solo creatore o admin/topadmin) |
| `/api/events/[id]` | DELETE | Elimina (solo creatore o admin/topadmin) |
| `/api/events/[id]/cover` | POST | Upload locandina (multipart → Supabase Storage) |
| `/api/events/[id]/cover` | DELETE | Rimuovi locandina |
| `/api/events/[id]/rsvp` | POST | Crea/aggiorna RSVP (`{ stato: confermato|forse|annullato }`) |
| `/api/events/[id]/attendees` | GET | Lista iscritti (solo creatore/admin/topadmin/diamante) |
| `/api/cron/event-reminders` | GET | Cron protetto da `CRON_SECRET`, manda email reminder |

**`vercel.json`**:
```json
{
  "crons": [
    { "path": "/api/cron/event-reminders", "schedule": "0 7 * * *" }
  ]
}
```

**Env var aggiuntiva**: `CRON_SECRET` (stringa random, in Vercel + `.env.local`). Il cron endpoint verifica `Authorization: Bearer ${CRON_SECRET}`.

---

## 3. Pagine UI

### `/eventi` — Lista
- 2 tab: **Attivi** (data_inizio ≥ oggi) / **Storico** (passati)
- **Mobile**: card con nome, data, location, badge modalità, badge visibilità, chip RSVP corrente
- **Desktop** (`md+`): tabella con colonne nome, data, location, modalità, iscritti/capienza, RSVP
- Bottone "+ Nuovo evento" visibile solo a admin/topadmin/diamante/platino
- Tutti i colori via token Ocean Pro (`bg-bg-card`, `text-text-primary`, `bg-accent`, ecc.)

### `/eventi/nuovo` — Creazione
- Form: nome*, descrizione, data_inizio*, data_fine, location, location_url, modalità (select), capienza_max, prezzo, link_prenotazione, link_evento, visibilità (globale/gruppo)
- `platino_id`: autocomplete (stesso pattern di `/registrati`), visibile solo se visibilità=gruppo e ruolo ≥ diamante
- Upload locandina: drag & drop / file picker, resize client-side a 1200px con Canvas API, preview immediata, upload POST a `/api/events/[id]/cover` dopo la creazione
- Submit → redirect a `/eventi/[id]`

### `/eventi/[id]` — Dettaglio
- Header: locandina full-width (se presente), nome, data/ora, location con link maps, badge modalità, link_evento (Zoom/Meet)
- Sezione RSVP: 3 bottoni (Confermato / Forse / Annullato), stato corrente evidenziato in `bg-accent`
- Sezione "Lista iscritti" (visibile solo a creatore/admin/topadmin/diamante): tabella nome + stato RSVP + data risposta, contatore `X confermati / Y capienza`
- Bottoni modifica/elimina in alto a destra (solo creatore o admin)

### `/eventi/[id]/modifica` — Modifica
- Stesso form di creazione pre-popolato

---

---

## 4b. Personalizzazione email reminder

### Template globale (base)
- Pagina `/impostazioni/email-template` (admin/topadmin only) con editor del template HTML base
- Variabili disponibili: `{nome}`, `{nome_evento}`, `{data}`, `{ora}`, `{location}`, `{link_evento}`, `{link_app}`, `{locandina_url}`
- Il template include automaticamente la locandina (`<img>`) se `locandina_url` è presente sull'evento
- Salvato in `system_flags` con chiave `email_reminder_template` (valore TEXT/HTML)
- Preview live nel editor: mostra come apparirà l'email con dati di esempio

### Testo aggiuntivo per-evento
- Campo `testo_reminder TEXT` aggiunto alla tabella `events`
- Nel form creazione/modifica evento: textarea opzionale "Messaggio personalizzato reminder"
- Se valorizzato, viene appeso al corpo del template globale come sezione separata
- Es. "Ricordati di portare il tuo catalogo e i campioni SA8!"

### Flusso email completa
1. Template globale (con logo, intestazione Ocean Pro navy)
2. Locandina dell'evento (se presente, inline nel corpo)
3. Dettagli evento: data/ora, location, link Zoom/Meet
4. Testo personalizzato per-evento (se presente, in box evidenziato)
5. CTA button → `https://weshare.growset.it/eventi/[id]`
6. Footer WeShare

### Preview prima dell'invio manuale
- Nella pagina `/eventi/[id]`, bottone "Anteprima email" apre modal con preview HTML dell'email che verrà inviata (con dati reali dell'evento)
- Stesso modal accessibile dal bottone "Invia reminder ora"

---

## 4c. WhatsApp reminder (no invio automatico — rischio ban)

Stessa filosofia dei messaggi prospect: template pre-compilato, invio manuale dal platino/diamante.

### Bottone "Invia su WhatsApp" (per singolo iscritto)
- Nella lista iscritti, ogni riga ha un bottone WA `wa.me/+39[telefono]?text=...`
- Testo pre-compilato: 
  ```
  Ciao [Nome]! 👋
  Ti ricordo l'evento *[Nome Evento]* 
  📅 [Data] alle [Ora]
  📍 [Location]
  🔗 [Link Zoom/Meet se presente]
  Ti aspettiamo! 🙌
  ```
- Visibile solo se il profilo dell'iscritto ha `telefono` valorizzato

### Bottone "Copia testo per gruppo" (broadcast)
- Bottone in evidenza nella sezione reminder della pagina evento
- Copia negli appunti il testo formattato per broadcast su gruppo WhatsApp
- Testo include locandina_url come link (non inline, WhatsApp la preview automaticamente)
- Toast di conferma "Testo copiato!"
- Testo:
  ```
  📢 *[Nome Evento]*
  
  [Descrizione breve se presente]
  
  📅 [Data] alle [Ora]
  📍 [Location]
  🎟️ Posti disponibili: [capienza_max - confermati rimasti]
  🔗 [Link prenotazione o link evento]
  
  👉 Iscriviti su WeShare: https://weshare.growset.it/eventi/[id]
  
  _WeShare · powered by Me.To.Do for you®_
  ```

---

## 4d. Reminder aggiuntivi (platino/diamante)

**Automatici** — il cron gira ogni mattina alle 07:00 UTC e manda email in due occasioni:
- **7 giorni prima** dell'evento (subject: `[Nome Evento] è tra 7 giorni!`)
- **1 giorno prima** dell'evento (subject: `Reminder: [Nome Evento] è domani!`)

Logica cron: query `data_inizio` tra `ora+7gg 00:00` e `ora+7gg 23:59` (per il 7gg) + stessa query per `ora+1gg` (già previsto). Un singolo endpoint gestisce entrambi.

Per evitare doppi invii: tabella `event_reminder_logs` (o campo `reminder_sent_7d BOOLEAN DEFAULT false` + `reminder_sent_1d BOOLEAN DEFAULT false` su `events`) — quando il cron manda, segna il flag. Se ri-girava per errore, salta.

**Manuale "on demand"** — nuovo endpoint:

| Endpoint | Metodo | Descrizione |
|---|---|---|
| `/api/events/[id]/remind` | POST | Invia reminder immediato a tutti gli iscritti confermati. Solo creatore/admin/topadmin/diamante/platino. |

Nella pagina `/eventi/[id]`, sezione visibile solo al creatore/admin/topadmin/diamante/platino:
- Bottone **"Invia reminder ora"** → POST `/api/events/[id]/remind` → toast di conferma con conteggio email inviate
- Nessun limite artificiale al numero di invii manuali (è responsabilità del creatore non spammare)

---

## 5. Tipi TypeScript

**`src/lib/types/events.ts`**:
```typescript
export type EventModalita = 'presenza' | 'online' | 'hybrid';
export type EventVisibilita = 'globale' | 'gruppo';
export type RsvpStato = 'confermato' | 'forse' | 'annullato';

export interface Evento {
  id: string;
  nome: string;
  descrizione: string | null;
  data_inizio: string;
  data_fine: string | null;
  location: string | null;
  location_url: string | null;
  modalita: EventModalita | null;
  capienza_max: number | null;
  prezzo: number | null;
  link_prenotazione: string | null;
  link_evento: string | null;
  locandina_url: string | null;
  visibilita: EventVisibilita;
  platino_id: string | null;
  creato_da: string;
  created_at: string;
  updated_at: string;
  // join opzionale
  my_rsvp?: RsvpStato | null;
  attendees_count?: number;
}

export interface EventAttendee {
  event_id: string;
  user_id: string;
  stato: RsvpStato;
  responded_at: string;
  // join opzionale
  profile?: { nome: string; email: string };
}
```

---

## 6. Email Reminder

**Mittente**: `noreply@growset.it` (dominio già verificato su Resend)
**Subject**: `Reminder: [Nome Evento] è domani!`
**Destinatari**: tutti gli attendees con `stato = 'confermato'` per eventi con `data_inizio` tra domani 00:00 e domani 23:59 UTC

**Template** (HTML semplice, inline styles, branding Ocean Pro):
- Header navy `#0B2545` con testo WeShare
- Body: saluto con nome, dettagli evento (data/ora, location, link Zoom se presente)
- CTA button blu `#1D6FA4` → `https://weshare.growset.it/eventi/[id]`
- Footer: "WeShare · powered by Me.To.Do for you®"

---

## 7. Struttura file da creare

```
src/
  app/
    (dashboard)/
      eventi/
        page.tsx                  ← lista + tab Attivi/Storico
        nuovo/
          page.tsx                ← form creazione
        [id]/
          page.tsx                ← dettaglio + RSVP + iscritti
          modifica/
            page.tsx              ← form modifica
    api/
      events/
        route.ts                  ← GET lista, POST crea
        [id]/
          route.ts                ← GET, PATCH, DELETE
          cover/
            route.ts              ← POST upload, DELETE
          rsvp/
            route.ts              ← POST
          attendees/
            route.ts              ← GET lista iscritti
          remind/
            route.ts              ← POST reminder manuale on demand (email)
          remind-preview/
            route.ts              ← GET preview HTML email (per modal anteprima)
      cron/
        event-reminders/
          route.ts                ← GET cron protetto
  lib/
    types/
      events.ts                   ← tipi TypeScript
    events/
      email.ts                    ← helper template email Resend (globale + per-evento)
      whatsapp.ts                 ← helper generazione testi WA (singolo + broadcast)
supabase/
  migrations/
    006_eventi.sql
vercel.json                       ← aggiunta cron schedule
```

---

## 8. Note architetturali

- **Migration 006 per `/impostazioni`** (profiles.foto_url, cap, codice_attivita, diamante_riferimento_id) rinominata a **009** per evitare conflitti numerici
- La tabella `events` esiste già in Supabase ma **non ha file migration locale** — il file 006 la ricrea con `IF NOT EXISTS` per allineare lo stato locale al remoto
- `CRON_SECRET` va aggiunto come env var in Vercel (Settings → Environment Variables) e in `.env.local`
- L'upload locandina avviene in 2 step: prima crea l'evento (ottieni l'id), poi upload cover con l'id
- Il bucket `event-covers` va creato manualmente nella Supabase dashboard (Storage → New bucket) oppure via migration SQL con `storage.buckets`
