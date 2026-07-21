# Reminder eventi esteso (7gg/1gg/2h + prospect) — Design

## Contesto

Oggi il sistema reminder invia email automatiche a 7 giorni e 1 giorno prima di un evento, solo ai partner iscritti (`event_attendees`), tramite un cron Vercel giornaliero (`vercel.json`, `0 7 * * *` → `GET /api/cron/event-reminders`). La logica lavora "a finestra del giorno": ogni esecuzione controlla se `data_inizio` cade esattamente nel giorno corrispondente a 7gg/1gg da ora, e marca un flag booleano sull'evento (`reminder_sent_7d`/`reminder_sent_1d`) per non reinviare.

Con l'introduzione della prenotazione prospect (sessione 2026-07-20/21), gli iscritti a un evento non sono più solo partner: esistono anche prospect senza account (`event_prospect_bookings`). Questo spec estende il sistema per: aggiungere un terzo livello a **2 ore prima**, includere i prospect in tutti i livelli, ed estendere anche il bottone manuale "Invia reminder" del dettaglio evento.

**Vincolo tecnico scoperto**: il progetto è su piano **Vercel Hobby**, che limita i cron nativi a una sola esecuzione al giorno — incompatibile con la cadenza necessaria per il livello 2 ore (ogni 15-30 min). Verificato che né via API Vercel (nessun tool espone il piano) né via documentazione MCP è stato possibile confermarlo programmaticamente; confermato dall'utente controllando il dashboard.

## Decisioni chiave

- **Trigger sostituito**: cron nativo Vercel rimosso da `vercel.json`, sostituito da un **workflow GitHub Actions** schedulato ogni 15 minuti (`.github/workflows/event-reminders.yml`) che chiama `GET /api/cron/event-reminders` con `Authorization: Bearer ${{ secrets.CRON_SECRET }}`. Nessun servizio esterno da gestire, nessun nuovo account: il repo è già su GitHub. Il secret `CRON_SECRET` va aggiunto ai secret del repo (stesso valore già presente su Vercel) — eseguibile via `gh secret set` con l'autenticazione locale già disponibile.
- **Logica a soglia, non a finestra**: ogni livello (7gg/1gg/2h) diventa "tempo rimanente all'evento ≤ soglia E flag non ancora inviato → invia e marca flag". Sostituisce interamente la logica a finestra-del-giorno esistente. Più robusto rispetto al jitter di GitHub Actions (esecuzione non garantita al minuto esatto — GitHub può ritardare workflow schedulati di alcuni minuti, specie sotto carico) e più semplice: un'unica query per livello invece di calcolare range di inizio/fine giornata.
- **Destinatari unificati**: ogni livello raccoglie sia `event_attendees` (partner, `stato='confermato'`) sia `event_prospect_bookings` (prospect, `stato='confermato'`) — stesso pattern già usato per la lista iscritti unificata (`/api/events/[id]/attendees`). I prospect in lista d'attesa (`in_attesa`) non ricevono reminder, come i partner con RSVP diverso da confermato oggi.
- **Nuova colonna**: `events.reminder_sent_2h BOOLEAN NOT NULL DEFAULT false` (le colonne 7gg/1gg esistenti restano invariate, stessa semantica).
- **Bottone manuale esteso**: `POST /api/events/[id]/remind` (invio immediato su richiesta dell'organizzatore) include ora anche i prospect confermati, oltre ai partner. Il testo del soggetto resta fisso su "è domani" come oggi (comportamento preesistente invariato, non è nello scope di questo spec correggerlo per riflettere il tempo reale rimanente).
- **Tipo tier esplicito**: `buildReminderEmail` cambia firma da `daysAhead: 1 | 7` a `tier: "7d" | "1d" | "2h"` (tipo esportato `ReminderTier`), con subject dedicato per il nuovo livello 2h. Tutti i chiamanti esistenti (`remind/route.ts`, `remind-preview/route.ts`) aggiornati al nuovo tipo, comportamento invariato per i livelli già esistenti.
- **Nessun impatto sulla dedup esistente**: la semantica "un flag per evento, non per destinatario" resta identica a oggi — un prospect che si prenota DOPO che il flag di un livello è già scattato non riceverà quel livello (stesso limite già accettato oggi per i partner che fanno RSVP tardivo). Non nello scope di questo spec passare a tracking per-destinatario.

## Data model — migration `020_reminder_2h.sql`

```sql
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS reminder_sent_2h BOOLEAN NOT NULL DEFAULT false;
```

## Trigger — GitHub Actions

**`.github/workflows/event-reminders.yml`** (nuovo):

```yaml
name: Event Reminders
on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch: {}

jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Call reminder endpoint
        run: |
          curl -sf -X GET "https://weshare.growset.it/api/cron/event-reminders" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

`workflow_dispatch` aggiunto per poter lanciare un test manuale da GitHub UI/CLI senza aspettare la prossima esecuzione schedulata.

**`vercel.json`**: rimossa la entry `crons` esistente (unica fonte di trigger diventa GitHub Actions).

**Setup richiesto**: `gh secret set CRON_SECRET --repo Normecancelli/weshare` con lo stesso valore già in `.env.local`/Vercel.

## API — `GET /api/cron/event-reminders` (riscritto)

Sostituisce interamente `getDayRange`/`sendRemindersForDay` con un ciclo su 3 tier a soglia:

```typescript
const TIERS: { tier: ReminderTier; flag: "reminder_sent_7d" | "reminder_sent_1d" | "reminder_sent_2h"; hoursAhead: number }[] = [
  { tier: "7d", flag: "reminder_sent_7d", hoursAhead: 168 },
  { tier: "1d", flag: "reminder_sent_1d", hoursAhead: 24 },
  { tier: "2h", flag: "reminder_sent_2h", hoursAhead: 2 },
];
```

Per ogni tier: `SELECT * FROM events WHERE {flag} = false AND data_inizio > now() AND data_inizio <= now() + hoursAhead`. Per ogni evento trovato, raccoglie destinatari uniti (partner confermati + prospect confermati), invia l'email a ciascuno, poi marca il flag. Risposta: conteggio inviati per tier, es. `{"7d": 3, "1d": 1, "2h": 0}`.

Stesso auth check esistente (`Authorization: Bearer CRON_SECRET`, 401 se assente/errato) — invariato, funziona identico sia chiamato da Vercel sia da GitHub Actions.

## API — `POST /api/events/[id]/remind` (esteso)

Stessa auth/autorizzazione esistente (`canSendReminder`). Oltre alla query esistente su `event_attendees`, aggiunge query su `event_prospect_bookings` (join `prospects`) per raccogliere anche i prospect confermati come destinatari. Tier fisso `"1d"` per il subject (comportamento invariato).

## API — `GET /api/events/[id]/remind-preview`

Nessuna modifica funzionale: aggiorna solo la chiamata a `buildReminderEmail` per usare `"1d"` invece di `1` (allineamento al nuovo tipo).

## `src/lib/events/email.ts`

`buildReminderEmail(evento, attendeeName, tier: ReminderTier, globalTemplate?)`. Subject per tier:
- `"7d"` → `"{nome evento} è tra 7 giorni!"` (invariato)
- `"1d"` → `"Reminder: {nome evento} è domani!"` (invariato)
- `"2h"` → `"{nome evento} inizia tra poche ore!"` (nuovo)

Corpo email invariato (stesso template, nessuna differenza di contenuto tra tier oltre al subject — coerente con l'approccio esistente).

## Fuori scope

- Tracking per-destinatario dei reminder già inviati (oggi e dopo questo spec resta per-evento/per-flag).
- Promozione automatica da lista d'attesa a confermato — resta gestione manuale (già deciso nello spec prenotazione).
- Correzione del subject "è domani" sul bottone manuale per riflettere il tempo reale rimanente — comportamento preesistente, non toccato.
- Notifica/alert se GitHub Actions smette di eseguire il workflow (es. repo inattivo per 60gg disabilita gli schedule di default su GitHub — da monitorare manualmente, non automatizzato in questo spec).

## Testing

Nessun test automatico nel progetto — verifica manuale:

1. Applicare la migration `020` in produzione (Supabase SQL Editor).
2. Impostare il secret GitHub `CRON_SECRET` (stesso valore di Vercel).
3. Lanciare il workflow manualmente (`gh workflow run event-reminders.yml` o da GitHub UI, grazie a `workflow_dispatch`), verificare nei log del job che la chiamata risponda 200 e non 401.
4. Verificare via query diretta (script Node temporaneo, service role) che un evento con `data_inizio` entro le prossime 2h/24h/7gg e flag corrispondente `false` riceva effettivamente l'email e il flag scatti a `true` dopo l'esecuzione.
5. Verificare che un evento con flag già `true` non generi un secondo invio anche se il workflow gira di nuovo entro la stessa soglia.
6. Verificare che un prospect confermato su un evento riceva il reminder allo stesso modo di un partner confermato.
7. Bottone manuale "Invia reminder" dal dettaglio evento: verificare che il conteggio "inviati" includa sia partner sia prospect.
