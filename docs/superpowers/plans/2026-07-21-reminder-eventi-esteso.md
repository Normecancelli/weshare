# Reminder eventi esteso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estendere il sistema reminder eventi con un terzo livello (2 ore prima), includere i prospect prenotati (oltre ai partner) in tutti i livelli automatici e nel bottone manuale, sostituendo il cron nativo Vercel (incompatibile con la cadenza necessaria sul piano Hobby) con un trigger GitHub Actions.

**Architecture:** Logica a soglia ("tempo rimanente ≤ N ore E flag non inviato → invia e marca") sostituisce la logica a finestra-del-giorno esistente in `/api/cron/event-reminders`. Un helper condiviso `getConfirmedRecipients` unifica la raccolta destinatari (partner da `event_attendees` + prospect da `event_prospect_bookings`) sia per il cron automatico sia per il bottone manuale. GitHub Actions chiama l'endpoint esistente ogni 15 minuti al posto del cron Vercel.

**Tech Stack:** Next.js 16 App Router, Supabase, Resend, GitHub Actions. Nessun framework di test automatico — verifica tramite `npm run lint` + verifica manuale via script Node/curl contro il DB e l'endpoint di produzione (unico ambiente esistente).

## Global Constraints

- Migration numerata `020_reminder_2h.sql`.
- Tre livelli: `"7d"` (168h), `"1d"` (24h), `"2h"` (2h) — soglie esatte, non modificabili.
- Subject per tier: `"7d"` → `"{nome evento} è tra 7 giorni!"`; `"1d"` → `"Reminder: {nome evento} è domani!"`; `"2h"` → `"{nome evento} inizia tra poche ore!"`.
- `vercel.json`: rimossa la chiave `crons` esistente (diventa `{}`).
- GitHub Actions: schedule `*/15 * * * *`, più `workflow_dispatch` per test manuali.
- Auth invariata su `/api/cron/event-reminders` (`Authorization: Bearer CRON_SECRET`, 401 se mancante/errato).
- Bottone manuale (`/api/events/[id]/remind`) usa sempre tier `"1d"` per il subject, comportamento invariato salvo l'aggiunta dei prospect come destinatari.
- Nessun tracking per-destinatario: flag booleano per evento, stessa semantica di oggi.
- Riferimento: `docs/superpowers/specs/2026-07-21-reminder-eventi-esteso-design.md`.

---

## Task 1: Migration DB + tipo ReminderTier

**Files:**
- Create: `supabase/migrations/020_reminder_2h.sql`
- Modify: `src/lib/events/email.ts`

**Interfaces:**
- Produces: colonna `events.reminder_sent_2h BOOLEAN NOT NULL DEFAULT false`; tipo `ReminderTier = "7d" | "1d" | "2h"` esportato da `src/lib/events/email.ts`; `buildReminderEmail(evento: Evento, attendeeName: string, tier: ReminderTier, globalTemplate?: string | null): { subject: string; html: string }` (firma cambiata da `daysAhead: 1 | 7`).

- [ ] **Step 1: Scrivi la migration**

```sql
-- supabase/migrations/020_reminder_2h.sql
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS reminder_sent_2h BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Aggiorna `buildReminderEmail` in `src/lib/events/email.ts`**

Sostituisci l'intera funzione `buildReminderEmail` (da `export function buildReminderEmail(` a `}` di chiusura) con:

```typescript
export type ReminderTier = "7d" | "1d" | "2h";

export function buildReminderEmail(
  evento: Evento,
  attendeeName: string,
  tier: ReminderTier,
  globalTemplate?: string | null
): { subject: string; html: string } {
  const template = globalTemplate || DEFAULT_EMAIL_TEMPLATE;
  const subject = {
    "7d": `${evento.nome} è tra 7 giorni!`,
    "1d": `Reminder: ${evento.nome} è domani!`,
    "2h": `${evento.nome} inizia tra poche ore!`,
  }[tier];

  const html = applyTemplate(template, {
    nome: attendeeName,
    nome_evento: evento.nome,
    data: formatDate(evento.data_inizio),
    ora: formatTime(evento.data_inizio),
    location: evento.location,
    link_evento: evento.link_evento,
    locandina_url: evento.locandina_url,
    testo_reminder: evento.testo_reminder,
    link_app: `https://weshare.growset.it/eventi/${evento.id}`,
  });

  return { subject, html };
}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: nessun nuovo errore. I chiamanti esistenti (`remind/route.ts`, `remind-preview/route.ts`) ora falliranno il type-check perché passano `1` invece di `"1d"` — questo è ATTESO, verranno corretti nel Task 3. Se `npm run lint` include il type-check e blocca su questo, verificalo comunque: l'errore deve essere SOLO nei due file che verranno corretti al Task 3, nessun altro file.

- [ ] **Step 4: Applica la migration in produzione**

Copia il contenuto SQL nel SQL Editor di Supabase (stesso procedimento manuale delle migration precedenti) ed eseguilo.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/020_reminder_2h.sql src/lib/events/email.ts
git commit -m "feat(reminder): colonna reminder_sent_2h + tipo ReminderTier"
```

---

## Task 2: Helper destinatari unificati + riscrittura cron a soglia

**Files:**
- Modify: `src/lib/events/prenotazione.ts`
- Modify: `src/app/api/cron/event-reminders/route.ts`

**Interfaces:**
- Consumes: `ReminderTier`/`buildReminderEmail` (Task 1)
- Produces: `getConfirmedRecipients(admin: SupabaseClient, eventId: string): Promise<{ nome: string; email: string }[]>` esportato da `src/lib/events/prenotazione.ts` — riusato anche dal Task 3.

- [ ] **Step 1: Aggiungi l'helper destinatari in `src/lib/events/prenotazione.ts`**

Aggiungi in fondo al file:

```typescript
export interface ReminderRecipient {
  nome: string;
  email: string;
}

export async function getConfirmedRecipients(
  admin: SupabaseClient,
  eventId: string
): Promise<ReminderRecipient[]> {
  const [{ data: attendees }, { data: bookings }] = await Promise.all([
    admin
      .from("event_attendees")
      .select("profile:profiles!user_id(nome, email)")
      .eq("event_id", eventId)
      .eq("stato", "confermato"),
    admin
      .from("event_prospect_bookings")
      .select("prospect:prospects!prospect_id(nome, email)")
      .eq("event_id", eventId)
      .eq("stato", "confermato"),
  ]);

  const recipients: ReminderRecipient[] = [];
  for (const a of (attendees || []) as { profile: { nome: string; email: string } | null }[]) {
    if (a.profile?.email) recipients.push({ nome: a.profile.nome, email: a.profile.email });
  }
  for (const b of (bookings || []) as { prospect: { nome: string; email: string | null } | null }[]) {
    if (b.prospect?.email) recipients.push({ nome: b.prospect.nome, email: b.prospect.email });
  }
  return recipients;
}
```

- [ ] **Step 2: Riscrivi `src/app/api/cron/event-reminders/route.ts`**

Sostituisci l'intero contenuto del file con:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReminderEmail, type ReminderTier } from "@/lib/events/email";
import { getConfirmedRecipients } from "@/lib/events/prenotazione";
import type { Evento } from "@/lib/types/events";

const TIERS: { tier: ReminderTier; flag: "reminder_sent_7d" | "reminder_sent_1d" | "reminder_sent_2h"; hoursAhead: number }[] = [
  { tier: "7d", flag: "reminder_sent_7d", hoursAhead: 168 },
  { tier: "1d", flag: "reminder_sent_1d", hoursAhead: 24 },
  { tier: "2h", flag: "reminder_sent_2h", hoursAhead: 2 },
];

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const admin = createAdminClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data: flagData } = await admin
    .from("system_flags").select("value").eq("flag_name", "email_reminder_template").single();
  const globalTemplate = flagData?.value as string | null;

  const now = new Date();
  const sentByTier: Record<ReminderTier, number> = { "7d": 0, "1d": 0, "2h": 0 };

  for (const { tier, flag, hoursAhead } of TIERS) {
    const threshold = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000).toISOString();
    const { data: events } = await admin
      .from("events")
      .select("*")
      .eq(flag, false)
      .gt("data_inizio", now.toISOString())
      .lte("data_inizio", threshold);

    for (const evento of events || []) {
      const recipients = await getConfirmedRecipients(admin, evento.id);
      for (const r of recipients) {
        const { subject, html } = buildReminderEmail(evento as Evento, r.nome, tier, globalTemplate);
        const { error } = await resend.emails.send({
          from: "WeShare <noreply@growset.it>",
          to: r.email,
          subject,
          html,
        });
        if (!error) sentByTier[tier]++;
      }
      await admin.from("events").update({ [flag]: true }).eq("id", evento.id);
    }
  }

  console.log("[cron/event-reminders]", sentByTier);
  return NextResponse.json(sentByTier);
}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: nessun nuovo errore nei due file toccati (i due file rimasti da correggere al Task 3 restano con l'errore atteso, se il type-check li segnala).

- [ ] **Step 4: Verifica manuale**

Con `npm run dev` attivo, usa uno script Node temporaneo (service role, chiave da `.env.local` via variabile d'ambiente, mai hardcoded) per:
1. Trovare o creare temporaneamente un evento reale con `data_inizio` entro le prossime 2 ore e `reminder_sent_2h = false` (se non esiste un evento reale adatto, valuta se testare solo a livello di query/logica senza alterare dati reali, oppure chiedi conferma esplicita all'utente prima di modificare `data_inizio` di un evento reale).
2. Chiamare `curl http://localhost:3000/api/cron/event-reminders -H "Authorization: Bearer $CRON_SECRET"` (leggi `CRON_SECRET` da `.env.local`).
3. Verificare che la risposta sia `{"7d":N,"1d":N,"2h":N}` con conteggi coerenti, e che il flag `reminder_sent_2h` dell'evento di test sia ora `true`.
4. Verificare che una seconda chiamata non reinvii (flag già `true`).
5. Elimina lo script temporaneo al termine.

- [ ] **Step 5: Commit**

```bash
git add src/lib/events/prenotazione.ts src/app/api/cron/event-reminders/route.ts
git commit -m "feat(reminder): riscrive cron a soglia con destinatari unificati partner+prospect"
```

---

## Task 3: Estendi bottone manuale + correggi preview

**Files:**
- Modify: `src/app/api/events/[id]/remind/route.ts`
- Modify: `src/app/api/events/[id]/remind-preview/route.ts`

**Interfaces:**
- Consumes: `getConfirmedRecipients` (Task 2), `ReminderTier`/`buildReminderEmail` (Task 1)

- [ ] **Step 1: Sostituisci il contenuto di `src/app/api/events/[id]/remind/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canSendReminder } from "@/lib/auth/roles";
import { buildReminderEmail } from "@/lib/events/email";
import { getConfirmedRecipients } from "@/lib/events/prenotazione";
import type { Evento } from "@/lib/types/events";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: evento } = await supabase
    .from("events").select("*").eq("id", id).single();
  if (!evento) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(admin, user.id);
  if (!canSendReminder(ruolo, qualifica, evento.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  // Carica template globale da system_flags (flag_name = chiave)
  const { data: flagData } = await admin
    .from("system_flags").select("value").eq("flag_name", "email_reminder_template").single();
  const globalTemplate = flagData?.value as string | null;

  const recipients = await getConfirmedRecipients(admin, id);
  if (!recipients.length) return NextResponse.json({ sent: 0 });

  let sent = 0;
  for (const r of recipients) {
    const { subject, html } = buildReminderEmail(evento as Evento, r.nome, "1d", globalTemplate);
    const { error } = await resend.emails.send({
      from: "WeShare <noreply@growset.it>",
      to: r.email,
      subject,
      html,
    });
    if (!error) sent++;
  }

  return NextResponse.json({ sent });
}
```

- [ ] **Step 2: Correggi `src/app/api/events/[id]/remind-preview/route.ts`**

Sostituisci:

```typescript
  const { subject, html } = buildReminderEmail(
    evento as Evento,
    (profile as { nome: string } | null)?.nome || "Partner",
    1,
    globalTemplate
  );
```

con:

```typescript
  const { subject, html } = buildReminderEmail(
    evento as Evento,
    (profile as { nome: string } | null)?.nome || "Partner",
    "1d",
    globalTemplate
  );
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: nessun nuovo errore in nessuno dei file toccati in questo piano finora (Task 1+2+3 insieme risolvono tutti i chiamanti di `buildReminderEmail`).

- [ ] **Step 4: Verifica manuale**

Con `npm run dev` attivo e loggato nel browser come organizzatore di un evento con almeno un partner e un prospect confermati (riusa dati di test già esistenti da sessioni precedenti se disponibili, es. evento `33d3d03d-776a-4a0f-9b40-c02ca2e6cea1`), clicca "Invia reminder" dal dettaglio evento. Verifica che il conteggio "inviati" nel toast includa sia il partner sia il prospect. Verifica anche "Anteprima email" (bottone esistente, chiama `remind-preview`): deve mostrare l'anteprima senza errori.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/events/\[id\]/remind/route.ts src/app/api/events/\[id\]/remind-preview/route.ts
git commit -m "feat(reminder): bottone manuale include prospect confermati"
```

---

## Task 4: Trigger GitHub Actions + rimozione cron Vercel

**Scoperta durante il Task 2** (non prevista nello spec originale): il middleware globale (`src/lib/supabase/middleware.ts`) reindirizza a `/login` qualsiasi richiesta non autenticata (nessun cookie di sessione) verso path non in whitelist — e `/api/cron/event-reminders` non c'è mai stato. Questo blocca QUALSIASI chiamata esterna (curl, GitHub Actions, e verosimilmente anche il vecchio cron nativo Vercel) prima ancora che la route arrivi a controllare `CRON_SECRET`. La route ha già la propria autenticazione via secret — il fix è aggiungerla alla whitelist del middleware, stesso trattamento già riservato ad altri endpoint con auth propria (`/api/sponsor/`, `/api/anteprima/`, ecc.).

**Files:**
- Create: `.github/workflows/event-reminders.yml`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `GET /api/cron/event-reminders` (Task 2), secret repo GitHub `CRON_SECRET`

- [x] **Step 0: Aggiungi `/api/cron/` alla whitelist del middleware** — **GIÀ FATTO nel Task 2** (commit `9574b9b`), applicato dal subagent per poter testare dal vivo la propria fix di logging. Verificato: `src/lib/supabase/middleware.ts` include ora `path.startsWith("/api/cron/")` in `isPublicPath`. Nessuna azione da ripetere qui.

- [ ] **Step 1: Crea il workflow**

```yaml
# .github/workflows/event-reminders.yml
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

- [ ] **Step 2: Rimuovi la entry cron da `vercel.json`**

Sostituisci l'intero contenuto del file con:

```json
{}
```

- [ ] **Step 3: Imposta il secret GitHub**

```bash
gh secret set CRON_SECRET --repo Normecancelli/weshare
```

Quando richiesto, incolla lo stesso valore già presente in `.env.local`/Vercel per `CRON_SECRET` (leggilo da `.env.local`, non chiederlo all'utente se già disponibile localmente — se il valore non è leggibile in questo ambiente, chiedi all'utente di fornirlo o di eseguire il comando lui stesso).

- [ ] **Step 4: Verifica che il file YAML sia sintatticamente valido**

Run: `gh workflow list --repo Normecancelli/weshare` (dopo il push, il workflow deve comparire nella lista) — oppure, prima del push, valida localmente la sintassi YAML se disponibile un linter, altrimenti verifica visivamente indentazione/struttura contro l'esempio sopra.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/event-reminders.yml vercel.json
git commit -m "feat(reminder): trigger GitHub Actions ogni 15 minuti, rimuove cron nativo Vercel"
```

- [ ] **Step 6: Dopo il merge/push su `AMWAY.partner`, test end-to-end in produzione**

1. Verifica che il secret `CRON_SECRET` sia impostato: `gh secret list --repo Normecancelli/weshare` (mostra solo il nome, non il valore).
2. Lancia il workflow manualmente: `gh workflow run event-reminders.yml --repo Normecancelli/weshare`.
3. Controlla l'esito: `gh run list --workflow=event-reminders.yml --repo Normecancelli/weshare --limit 1`, poi `gh run view <run-id> --repo Normecancelli/weshare --log` — verifica che la chiamata curl risponda senza errore (non 401).
4. Se il deploy Vercel con `vercel.json` aggiornato non ha ancora rimosso il vecchio cron, verificare da dashboard Vercel → Project → Settings → Cron Jobs che non ci siano più cron attivi per `/api/cron/event-reminders` (il trigger passa interamente a GitHub Actions).

---

## Self-Review

**Copertura spec**: migration (Task 1), tipo tier + subject (Task 1), helper destinatari unificato (Task 2), riscrittura cron a soglia (Task 2), bottone manuale esteso (Task 3), preview corretta (Task 3), trigger GitHub Actions + rimozione cron Vercel (Task 4) — tutte le sezioni dello spec coperte.

**Placeholder**: nessun TODO/TBD; ogni step ha codice completo.

**Coerenza tipi**: `ReminderTier` definito una sola volta (Task 1, `email.ts`), riusato identico in `prenotazione.ts` (Task 2, solo come parametro implicito tramite `TIERS` nel route file, non nel modulo stesso — l'helper `getConfirmedRecipients` non usa `ReminderTier`, corretto: non gli serve), `cron/event-reminders/route.ts` (Task 2) e `remind/route.ts` (Task 3, literal `"1d"`). Nessuna ridefinizione locale del tipo.
