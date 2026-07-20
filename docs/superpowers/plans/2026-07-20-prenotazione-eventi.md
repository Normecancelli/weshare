# Prenotazione eventi (prospect) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere a un prospect senza account di prenotarsi a un evento WeShare, sia tramite un link pubblico condivisibile per evento sia dalla vetrina personale già esistente, con gestione lista d'attesa e email di conferma immediata.

**Architecture:** Due nuove tabelle Supabase (`event_booking_links`, `event_prospect_bookings`) isolate da `event_attendees` esistente, accessibili solo via service role. Due endpoint pubblici (`/api/prenota/[token]` per il link condivisibile, `/api/anteprima/[token]/eventi/[id]` per la vetrina) delegano a due helper condivisi (`findOrCreateProspect`, `prenotaEvento`) per dedup prospect e calcolo capienza/lista d'attesa. Lato dashboard, la lista iscritti dell'organizzatore unisce `event_attendees` + `event_prospect_bookings`.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS + service-role client), Resend per email, `qrcode` per QR client-side. Nessun framework di test automatico nel progetto — verifica tramite `npm run lint` (unica automazione disponibile) + verifica manuale via browser/curl contro il DB di produzione (unico ambiente esistente).

## Global Constraints

- Migration numerata `019_prenotazione_eventi.sql` (018 è già occupata dal fix RLS di questa sessione).
- Le due nuove tabelle hanno RLS abilitata **senza policy**: accesso solo da `createAdminClient()` (service role), mai dal client autenticato/anonimo.
- Copy in italiano, stesso stile delle pagine pubbliche esistenti (`/contatto/[slug]`, `/anteprima/[token]`).
- Nessun rate-limiting/captcha (fuori scope, spec §"Fuori scope").
- Nessuna promozione automatica da lista d'attesa a confermato (fuori scope).
- Reminder 24h/2h e inclusione prospect nel sistema reminder esistente: fuori scope, non toccare `src/app/api/cron/event-reminders/route.ts`.
- Riferimento: `docs/superpowers/specs/2026-07-20-prenotazione-eventi-design.md`.

---

## Task 1: Migration DB + tipi TypeScript

**Files:**
- Create: `supabase/migrations/019_prenotazione_eventi.sql`
- Modify: `src/lib/types/events.ts`

**Interfaces:**
- Produces: tabelle `event_booking_links(id, event_id, partner_id, token, view_count, created_at)`, `event_prospect_bookings(id, event_id, prospect_id, stato, created_at)`; valore `prenotazione_evento` aggiunto a `prospects.source`; tipi TS `BookingStato`, `EventProspectBooking`, `AttendeeRow` esportati da `src/lib/types/events.ts`.

- [ ] **Step 1: Scrivi la migration**

```sql
-- supabase/migrations/019_prenotazione_eventi.sql
-- Pagina di prenotazione eventi per prospect senza account.
-- Vedi docs/superpowers/specs/2026-07-20-prenotazione-eventi-design.md

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
-- solo service role (bypassa RLS).

ALTER TABLE prospects DROP CONSTRAINT prospects_source_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_source_check
  CHECK (source IN ('contatto_personale', 'lista', 'social', 'referenza', 'altro', 'qr_link', 'prenotazione_evento'));
```

- [ ] **Step 2: Estendi i tipi TS**

Aggiungi in fondo a `src/lib/types/events.ts`:

```typescript
export type BookingStato = "confermato" | "in_attesa" | "annullato";

export interface EventProspectBooking {
  id: string;
  event_id: string;
  prospect_id: string;
  stato: BookingStato;
  created_at: string;
}

export interface AttendeeRow {
  tipo: "partner" | "prospect";
  id: string;
  nome: string;
  email: string | null;
  telefono: string | null;
  stato: RsvpStato | BookingStato;
  partnerNome?: string;
}

export const BOOKING_BADGE: Record<BookingStato, string> = {
  confermato: "bg-[#dcfce7] text-[#166534]",
  in_attesa: "bg-[#fef9c3] text-[#854d0e]",
  annullato: "bg-[#fee2e2] text-[#991b1b]",
};

export const BOOKING_LABELS: Record<BookingStato, string> = {
  confermato: "Confermato",
  in_attesa: "In lista d'attesa",
  annullato: "Annullato",
};
```

- [ ] **Step 3: Verifica lint**

Run: `npm run lint`
Expected: nessun errore nei file toccati (la migration SQL non è coperta da lint).

- [ ] **Step 4: Applica la migration in produzione**

Copia il contenuto di `supabase/migrations/019_prenotazione_eventi.sql` nel SQL Editor di Supabase (stesso procedimento manuale già usato per le migration precedenti in questo progetto — non esiste un runner automatico) ed eseguilo. Conferma nessun errore.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/019_prenotazione_eventi.sql src/lib/types/events.ts
git commit -m "feat(prenotazione): schema DB event_booking_links + event_prospect_bookings"
```

---

## Task 2: Estrai helper condiviso `findOrCreateProspect`

Oggi la logica di dedup/creazione prospect vive solo dentro `/api/contatto/[slug]/route.ts`. La estraiamo per riusarla nei due nuovi endpoint di prenotazione, senza cambiare il comportamento esistente.

**Files:**
- Create: `src/lib/prospects/find-or-create.ts`
- Modify: `src/app/api/contatto/[slug]/route.ts`

**Interfaces:**
- Produces: `findOrCreateProspect(admin: SupabaseClient, partnerId: string, input: { nome: string; telefono: string; email: string; source: string }): Promise<{ id: string } | { error: string }>`
- Consumes: nessuna dipendenza da task precedenti oltre alle librerie esistenti.

- [ ] **Step 1: Crea l'helper**

```typescript
// src/lib/prospects/find-or-create.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProspectInput {
  nome: string;
  telefono: string;
  email: string;
  source: string;
}

export async function findOrCreateProspect(
  admin: SupabaseClient,
  partnerId: string,
  input: ProspectInput
): Promise<{ id: string } | { error: string }> {
  const { nome, telefono, email, source } = input;

  let existingId: string | null = null;

  if (telefono) {
    const { data, error } = await admin
      .from("prospects")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("telefono", telefono)
      .maybeSingle();
    if (error) return { error: error.message };
    if (data) existingId = data.id;
  }
  if (!existingId && email) {
    const { data, error } = await admin
      .from("prospects")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("email", email)
      .maybeSingle();
    if (error) return { error: error.message };
    if (data) existingId = data.id;
  }

  if (existingId) {
    const { data, error } = await admin
      .from("prospects")
      .update({
        nome,
        ...(telefono ? { telefono } : {}),
        ...(email ? { email } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingId)
      .select("id")
      .single();
    if (error || !data) return { error: error?.message || "Errore durante il salvataggio" };
    return { id: data.id };
  }

  const { data, error } = await admin
    .from("prospects")
    .insert({
      partner_id: partnerId,
      nome,
      telefono: telefono || null,
      email: email || null,
      source,
      stato: "nuovo_contatto",
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message || "Errore durante il salvataggio" };
  return { id: data.id };
}
```

- [ ] **Step 2: Refactor di `/api/contatto/[slug]/route.ts` per usare l'helper**

Sostituisci l'intero contenuto del file con:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeSlug } from "@/lib/auth/slug";
import { upsertPreviewLink } from "@/lib/prospects/preview-link";
import { findOrCreateProspect } from "@/lib/prospects/find-or-create";

interface ContattoBody {
  nome?: string;
  cognome?: string;
  telefono?: string;
  email?: string;
  website?: string; // honeypot: deve restare vuoto
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const safeSlug = sanitizeSlug(slug);
  if (!safeSlug) {
    return NextResponse.json({ error: "Link non valido" }, { status: 400 });
  }

  let body: ContattoBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  if (body.website && body.website.trim()) {
    return NextResponse.json({ url: null });
  }

  const nome = (body.nome || "").trim();
  const cognome = (body.cognome || "").trim();
  const telefono = (body.telefono || "").trim();
  const email = (body.email || "").trim();

  if (!nome || (!telefono && !email)) {
    return NextResponse.json(
      { error: "Nome e almeno un contatto (telefono o email) sono obbligatori" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: partner, error: partnerErr } = await admin
    .from("profiles")
    .select("id")
    .ilike("invite_url_slug", safeSlug)
    .limit(1)
    .maybeSingle();

  if (partnerErr) {
    console.error("[api/contatto] Supabase error (partner lookup)", {
      slug: safeSlug,
      error: partnerErr,
    });
    return NextResponse.json(
      { error: "Errore durante la verifica del link. Riprova tra poco." },
      { status: 500 }
    );
  }
  if (!partner) {
    return NextResponse.json({ error: "Link non valido" }, { status: 404 });
  }

  const nomeCompleto = [nome, cognome].filter(Boolean).join(" ");

  const prospectResult = await findOrCreateProspect(admin, partner.id, {
    nome: nomeCompleto,
    telefono,
    email,
    source: "qr_link",
  });

  if ("error" in prospectResult) {
    console.error("[api/contatto] Supabase error (find-or-create)", {
      slug: safeSlug,
      error: prospectResult.error,
    });
    return NextResponse.json({ error: "Errore durante il salvataggio" }, { status: 500 });
  }

  const linkResult = await upsertPreviewLink(admin, prospectResult.id);
  if ("error" in linkResult) {
    return NextResponse.json({ error: linkResult.error }, { status: 500 });
  }

  const origin = request.nextUrl.origin;
  return NextResponse.json({ url: `${origin}/anteprima/${linkResult.token}` });
}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 4: Verifica manuale che il refactor non ha cambiato comportamento**

Con il server locale attivo (`npm run dev`), apri `/contatto/[il-tuo-slug-amway]` in incognito, compila il form con un telefono di test, invia. Verifica:
- Redirect a `/anteprima/[token]`
- In `/contatti` (loggato come il partner) compare il nuovo prospect con `source = qr_link`
- Ripetendo il submit con lo stesso telefono, il prospect viene aggiornato (non duplicato)

- [ ] **Step 5: Commit**

```bash
git add src/lib/prospects/find-or-create.ts src/app/api/contatto/[slug]/route.ts
git commit -m "refactor(prospects): estrae findOrCreateProspect, riusabile da prenotazione eventi"
```

---

## Task 3: Helper `prenotaEvento` (capacità + lista d'attesa)

**Files:**
- Create: `src/lib/events/prenotazione.ts`

**Interfaces:**
- Consumes: tabelle `event_attendees`, `event_prospect_bookings`, `events` (Task 1)
- Produces: `countConfirmedAttendees(admin: SupabaseClient, eventId: string): Promise<number>`, `prenotaEvento(admin: SupabaseClient, eventId: string, prospectId: string): Promise<{ stato: "confermato" | "in_attesa" } | { error: string }>`

- [ ] **Step 1: Scrivi l'helper**

```typescript
// src/lib/events/prenotazione.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export async function countConfirmedAttendees(
  admin: SupabaseClient,
  eventId: string
): Promise<number> {
  const [{ count: partnerCount }, { count: prospectCount }] = await Promise.all([
    admin
      .from("event_attendees")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("stato", "confermato"),
    admin
      .from("event_prospect_bookings")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("stato", "confermato"),
  ]);
  return (partnerCount || 0) + (prospectCount || 0);
}

export async function prenotaEvento(
  admin: SupabaseClient,
  eventId: string,
  prospectId: string
): Promise<{ stato: "confermato" | "in_attesa" } | { error: string }> {
  const { data: evento, error: eventoErr } = await admin
    .from("events")
    .select("capienza_max")
    .eq("id", eventId)
    .single();
  if (eventoErr || !evento) return { error: "Evento non trovato" };

  const { data: existing } = await admin
    .from("event_prospect_bookings")
    .select("stato")
    .eq("event_id", eventId)
    .eq("prospect_id", prospectId)
    .maybeSingle();

  let stato: "confermato" | "in_attesa" = "confermato";
  const giaConfermato = existing?.stato === "confermato";

  if (evento.capienza_max != null && !giaConfermato) {
    const confermatiAttuali = await countConfirmedAttendees(admin, eventId);
    if (confermatiAttuali >= evento.capienza_max) stato = "in_attesa";
  }

  const { error: upsertErr } = await admin
    .from("event_prospect_bookings")
    .upsert(
      { event_id: eventId, prospect_id: prospectId, stato },
      { onConflict: "event_id,prospect_id" }
    );
  if (upsertErr) return { error: upsertErr.message };

  return { stato };
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/lib/events/prenotazione.ts
git commit -m "feat(prenotazione): helper capacita/lista d'attesa prenotaEvento"
```

---

## Task 4: Email di conferma prenotazione

**Files:**
- Modify: `src/lib/events/email.ts`

**Interfaces:**
- Consumes: `Evento` (da `@/lib/types/events`), funzioni private `formatDate`/`formatTime` già definite nel file
- Produces: `buildBookingConfirmationEmail(evento: Evento, nome: string, stato: "confermato" | "in_attesa"): { subject: string; html: string }`

- [ ] **Step 1: Aggiungi la funzione in fondo a `src/lib/events/email.ts`**

```typescript
export function buildBookingConfirmationEmail(
  evento: Evento,
  nome: string,
  stato: "confermato" | "in_attesa"
): { subject: string; html: string } {
  const subject = stato === "confermato"
    ? `Prenotazione confermata: ${evento.nome}`
    : `In lista d'attesa: ${evento.nome}`;

  const statoMsg = stato === "confermato"
    ? "La tua prenotazione è confermata!"
    : "Sei in lista d'attesa: ti contatteremo se si libera un posto.";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px 16px">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
          <tr>
            <td style="background:#0B2545;padding:24px 32px;border-radius:12px 12px 0 0">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700">WeShare</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:12px">powered by Me.To.Do for you®</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px">
              <p style="margin:0 0 16px;color:#0B2545;font-size:16px">Ciao <strong>${nome}</strong>,</p>
              <p style="margin:0 0 16px;color:#0B2545;font-size:15px">${statoMsg}</p>
              <h2 style="margin:0 0 16px;color:#0B2545;font-size:20px">${evento.nome}</h2>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:8px">
                <tr><td style="padding:4px 0;color:#4A6480;font-size:14px">📅</td><td style="padding:4px 8px;color:#0B2545;font-size:14px"><strong>${formatDate(evento.data_inizio)}</strong> alle <strong>${formatTime(evento.data_inizio)}</strong></td></tr>
                ${evento.location ? `<tr><td style="padding:4px 0;color:#4A6480;font-size:14px">📍</td><td style="padding:4px 8px;color:#0B2545;font-size:14px">${evento.location}</td></tr>` : ""}
                ${evento.link_evento ? `<tr><td style="padding:4px 0;color:#4A6480;font-size:14px">🔗</td><td style="padding:4px 8px"><a href="${evento.link_evento}" style="color:#1D6FA4">Collegamento evento</a></td></tr>` : ""}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 0;text-align:center;color:#6B8099;font-size:12px">
              WeShare · powered by Me.To.Do for you® · <a href="https://weshare.growset.it" style="color:#1D6FA4">weshare.growset.it</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  return { subject, html };
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: nessun errore. `formatDate`/`formatTime` sono già definite più in alto nel file (usate da `buildReminderEmail`) — nessun nuovo import necessario.

- [ ] **Step 3: Commit**

```bash
git add src/lib/events/email.ts
git commit -m "feat(prenotazione): template email conferma/lista d'attesa"
```

---

## Task 5: Rotte pubbliche nel middleware

**Files:**
- Modify: `src/lib/supabase/middleware.ts:34-47`

**Interfaces:**
- Nessuna, solo estensione della whitelist path.

- [ ] **Step 1: Aggiungi i nuovi path pubblici**

Sostituisci il blocco `isPublicPath` (righe 34-47) con:

```typescript
  const isPublicPath =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/invite") ||
    path.startsWith("/anteprima") ||
    path.startsWith("/registrati") ||
    path.startsWith("/contatto") ||
    path.startsWith("/prenota") ||
    path === "/api/sponsor" ||
    path.startsWith("/api/sponsor/") ||
    path === "/api/profiles/platino-search" ||
    path === "/api/auth/signup" ||
    path.startsWith("/api/anteprima/") ||
    path.startsWith("/api/contatto/") ||
    path.startsWith("/api/prospects/public/") ||
    path.startsWith("/api/prenota/");
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "feat(prenotazione): rende pubbliche le rotte /prenota"
```

---

## Task 6: Endpoint autenticato per generare il link pubblico

**Files:**
- Create: `src/app/api/events/[id]/booking-link/route.ts`

**Interfaces:**
- Consumes: `getUserRoleAndQualifica`, `canManageEvent` da `@/lib/auth/roles`; tabella `event_booking_links` (Task 1)
- Produces: `POST /api/events/[id]/booking-link` → `{ url: string }` (autenticata, solo organizzatore/admin)

- [ ] **Step 1: Scrivi la route**

```typescript
// src/app/api/events/[id]/booking-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canManageEvent } from "@/lib/auth/roles";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: evento } = await supabase
    .from("events").select("creato_da").eq("id", id).single();
  if (!evento) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(admin, user.id);
  if (!canManageEvent(ruolo, qualifica, evento.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const origin = request.nextUrl.origin;

  const { data: existing } = await admin
    .from("event_booking_links")
    .select("token")
    .eq("event_id", id)
    .eq("partner_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ url: `${origin}/prenota/${existing.token}` });
  }

  const token = crypto.randomUUID().replace(/-/g, "");
  const { data: created, error } = await admin
    .from("event_booking_links")
    .insert({ event_id: id, partner_id: user.id, token })
    .select("token")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "Errore durante la generazione del link" }, { status: 500 });
  }

  return NextResponse.json({ url: `${origin}/prenota/${created.token}` });
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Verifica manuale con curl**

Con `npm run dev` attivo e loggato nel browser come organizzatore di un evento esistente, copia il cookie di sessione dal browser (devtools → Application → Cookies) e verifica:

```bash
curl -X POST http://localhost:3000/api/events/<ID_EVENTO>/booking-link \
  -H "Cookie: <cookie-sessione-copiato-dal-browser>"
```

Expected: `{"url":"http://localhost:3000/prenota/<token>"}` (200). Rilanciando lo stesso comando, verificare che `token` sia identico (upsert, non genera un nuovo link ogni volta).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/events/\[id\]/booking-link/route.ts
git commit -m "feat(prenotazione): endpoint genera link pubblico per evento"
```

---

## Task 7: Endpoint pubblico `/api/prenota/[token]`

**Files:**
- Create: `src/app/api/prenota/[token]/route.ts`

**Interfaces:**
- Consumes: `findOrCreateProspect` (Task 2), `prenotaEvento`/`countConfirmedAttendees` (Task 3), `buildBookingConfirmationEmail` (Task 4), tabella `event_booking_links` (Task 1)
- Produces: `GET /api/prenota/[token]` → `{ evento: {...}, postiRimasti: number|null }`; `POST /api/prenota/[token]` → `{ stato: "confermato"|"in_attesa" }`

- [ ] **Step 1: Scrivi la route**

```typescript
// src/app/api/prenota/[token]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateProspect } from "@/lib/prospects/find-or-create";
import { prenotaEvento, countConfirmedAttendees } from "@/lib/events/prenotazione";
import { buildBookingConfirmationEmail } from "@/lib/events/email";
import type { Evento } from "@/lib/types/events";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("event_booking_links")
    .select("id, event_id, view_count")
    .eq("token", token)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "Link non trovato" }, { status: 404 });

  const { data: evento } = await admin
    .from("events").select("*").eq("id", link.event_id).single();
  if (!evento) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });
  if (new Date(evento.data_inizio) < new Date()) {
    return NextResponse.json({ error: "Questo evento è già passato" }, { status: 410 });
  }

  let postiRimasti: number | null = null;
  if (evento.capienza_max != null) {
    const confermati = await countConfirmedAttendees(admin, evento.id);
    postiRimasti = Math.max(0, evento.capienza_max - confermati);
  }

  admin
    .from("event_booking_links")
    .update({ view_count: link.view_count + 1 })
    .eq("id", link.id)
    .then(() => {});

  return NextResponse.json({
    evento: {
      id: evento.id,
      nome: evento.nome,
      descrizione: evento.descrizione,
      data_inizio: evento.data_inizio,
      location: evento.location,
      location_url: evento.location_url,
      modalita: evento.modalita,
      prezzo: evento.prezzo,
      locandina_url: evento.locandina_url,
      link_evento: evento.link_evento,
    },
    postiRimasti,
  });
}

interface PrenotaBody {
  nome?: string;
  cognome?: string;
  telefono?: string;
  email?: string;
  website?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("event_booking_links")
    .select("event_id, partner_id")
    .eq("token", token)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "Link non trovato" }, { status: 404 });

  let body: PrenotaBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  if (body.website && body.website.trim()) {
    return NextResponse.json({ stato: "confermato" });
  }

  const nome = (body.nome || "").trim();
  const cognome = (body.cognome || "").trim();
  const telefono = (body.telefono || "").trim();
  const email = (body.email || "").trim();

  if (!nome || (!telefono && !email)) {
    return NextResponse.json(
      { error: "Nome e almeno un contatto (telefono o email) sono obbligatori" },
      { status: 400 }
    );
  }

  const { data: evento } = await admin
    .from("events").select("*").eq("id", link.event_id).single();
  if (!evento) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const nomeCompleto = [nome, cognome].filter(Boolean).join(" ");

  const prospectResult = await findOrCreateProspect(admin, link.partner_id, {
    nome: nomeCompleto,
    telefono,
    email,
    source: "prenotazione_evento",
  });
  if ("error" in prospectResult) {
    return NextResponse.json({ error: prospectResult.error }, { status: 500 });
  }

  const bookingResult = await prenotaEvento(admin, evento.id, prospectResult.id);
  if ("error" in bookingResult) {
    return NextResponse.json({ error: bookingResult.error }, { status: 500 });
  }

  if (email) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { subject, html } = buildBookingConfirmationEmail(evento as Evento, nomeCompleto, bookingResult.stato);
    await resend.emails.send({
      from: "WeShare <noreply@growset.it>",
      to: email,
      subject,
      html,
    }).catch((err) => {
      console.error("[api/prenota] Errore invio email conferma", err);
    });
  }

  return NextResponse.json({ stato: bookingResult.stato });
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Verifica manuale con curl**

Usa il token generato al Task 6:

```bash
curl http://localhost:3000/api/prenota/<TOKEN>
```
Expected: JSON con `evento.nome` e `postiRimasti`.

```bash
curl -X POST http://localhost:3000/api/prenota/<TOKEN> \
  -H "Content-Type: application/json" \
  -d '{"nome":"Test","cognome":"Prenotazione","telefono":"3331234567","email":"test-prenotazione@example.com"}'
```
Expected: `{"stato":"confermato"}` (o `"in_attesa"` se l'evento ha `capienza_max` già raggiunta). Verificare in `/contatti` del partner organizzatore che sia comparso un prospect "Test Prenotazione" con `source = prenotazione_evento`.

Honeypot: ripetere la POST con `"website":"spam"` nel body → expected `{"stato":"confermato"}` ma nessuna nuova riga in `/contatti` (nessuna scrittura).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/prenota/\[token\]/route.ts
git commit -m "feat(prenotazione): endpoint pubblico GET/POST /api/prenota/[token]"
```

---

## Task 8: Endpoint pubblico dalla vetrina `/api/anteprima/[token]/eventi/[id]`

**Files:**
- Create: `src/app/api/anteprima/[token]/eventi/[id]/route.ts`

**Interfaces:**
- Consumes: `prenotaEvento`/`countConfirmedAttendees` (Task 3), `buildBookingConfirmationEmail` (Task 4), tabelle `prospect_preview_links`, `prospects`, `profiles`, `events`
- Produces: `GET /api/anteprima/[token]/eventi/[id]` → `{ evento: {...}, postiRimasti: number|null, prospect: {...} }`; `POST` → `{ stato: "confermato"|"in_attesa" }`

Nota: replica la stessa logica di visibilità "gruppo" già implementata (inline, non astratta) in `src/app/api/anteprima/[token]/route.ts` — stesso pattern del codice esistente, che non la estrae in helper.

- [ ] **Step 1: Scrivi la route**

```typescript
// src/app/api/anteprima/[token]/eventi/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { prenotaEvento, countConfirmedAttendees } from "@/lib/events/prenotazione";
import { buildBookingConfirmationEmail } from "@/lib/events/email";
import type { Evento } from "@/lib/types/events";

async function resolveVisibleEvento(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
  eventId: string
) {
  const { data: link } = await admin
    .from("prospect_preview_links")
    .select("prospect_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!link) return { error: "Link non trovato", status: 404 } as const;
  if (new Date(link.expires_at) < new Date()) {
    return { error: "Link scaduto", status: 410 } as const;
  }

  const { data: prospect } = await admin
    .from("prospects")
    .select("partner_id, nome, telefono, email")
    .eq("id", link.prospect_id)
    .single();
  if (!prospect) return { error: "Link non trovato", status: 404 } as const;

  const { data: partner } = await admin
    .from("profiles")
    .select("ruolo, qualifica, platino_riferimento_id")
    .eq("id", prospect.partner_id)
    .single();
  if (!partner) return { error: "Link non trovato", status: 404 } as const;

  const { data: evento } = await admin
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("visibile_prospect", true)
    .maybeSingle();
  if (!evento) return { error: "Evento non trovato", status: 404 } as const;

  const highVisibility = ["admin", "topadmin"].includes(partner.ruolo || "") ||
    ["diamante", "smeraldo", "zaffiro", "rubino"].includes(partner.qualifica || "");
  const visibile = evento.visibilita === "globale" ||
    evento.creato_da === prospect.partner_id ||
    (evento.visibilita === "gruppo" && (
      (evento.platino_id != null && evento.platino_id === partner.platino_riferimento_id) || highVisibility
    ));
  if (!visibile) return { error: "Evento non trovato", status: 404 } as const;

  return { prospectId: link.prospect_id, prospect, evento } as const;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;
  const admin = createAdminClient();

  const resolved = await resolveVisibleEvento(admin, token, id);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { evento, prospect } = resolved;

  if (new Date(evento.data_inizio) < new Date()) {
    return NextResponse.json({ error: "Questo evento è già passato" }, { status: 410 });
  }

  let postiRimasti: number | null = null;
  if (evento.capienza_max != null) {
    const confermati = await countConfirmedAttendees(admin, evento.id);
    postiRimasti = Math.max(0, evento.capienza_max - confermati);
  }

  return NextResponse.json({
    evento: {
      id: evento.id,
      nome: evento.nome,
      descrizione: evento.descrizione,
      data_inizio: evento.data_inizio,
      location: evento.location,
      location_url: evento.location_url,
      modalita: evento.modalita,
      prezzo: evento.prezzo,
      locandina_url: evento.locandina_url,
      link_evento: evento.link_evento,
    },
    postiRimasti,
    prospect: { nome: prospect.nome, telefono: prospect.telefono, email: prospect.email },
  });
}

interface PrenotaBody {
  nome?: string;
  telefono?: string;
  email?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;
  const admin = createAdminClient();

  const resolved = await resolveVisibleEvento(admin, token, id);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { evento, prospectId } = resolved;

  let body: PrenotaBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const nome = (body.nome || "").trim();
  const telefono = (body.telefono || "").trim();
  const email = (body.email || "").trim();

  if (!nome || (!telefono && !email)) {
    return NextResponse.json(
      { error: "Nome e almeno un contatto (telefono o email) sono obbligatori" },
      { status: 400 }
    );
  }

  const { error: updateErr } = await admin
    .from("prospects")
    .update({
      nome,
      ...(telefono ? { telefono } : {}),
      ...(email ? { email } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", prospectId);
  if (updateErr) {
    return NextResponse.json({ error: "Errore durante il salvataggio" }, { status: 500 });
  }

  const bookingResult = await prenotaEvento(admin, evento.id, prospectId);
  if ("error" in bookingResult) {
    return NextResponse.json({ error: bookingResult.error }, { status: 500 });
  }

  if (email) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { subject, html } = buildBookingConfirmationEmail(evento as Evento, nome, bookingResult.stato);
    await resend.emails.send({
      from: "WeShare <noreply@growset.it>",
      to: email,
      subject,
      html,
    }).catch((err) => {
      console.error("[api/anteprima/eventi] Errore invio email conferma", err);
    });
  }

  return NextResponse.json({ stato: bookingResult.stato });
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Verifica manuale con curl**

Serve un token vetrina esistente (`prospect_preview_links.token`, generabile da `/contatti` → dettaglio prospect → "Genera link vetrina", oppure riusa quello creato al Task 2 Step 4) e un evento con `visibile_prospect = true` visibile a quel prospect.

```bash
curl "http://localhost:3000/api/anteprima/<TOKEN_VETRINA>/eventi/<ID_EVENTO>"
```
Expected: JSON con `evento`, `postiRimasti`, `prospect` precompilato.

```bash
curl -X POST "http://localhost:3000/api/anteprima/<TOKEN_VETRINA>/eventi/<ID_EVENTO>" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Test Vetrina","telefono":"3339876543","email":"test-vetrina@example.com"}'
```
Expected: `{"stato":"confermato"}`. Verificare che NON sia stato creato un nuovo prospect (stesso `prospect_id` del link vetrina, solo aggiornato).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/anteprima/\[token\]/eventi/
git commit -m "feat(prenotazione): endpoint pubblico prenotazione da vetrina prospect"
```

---

## Task 9: Componente form di prenotazione condiviso

**Files:**
- Create: `src/components/eventi/booking-form.tsx`

**Interfaces:**
- Produces: `<BookingForm initial? showCognome? onSubmit>` component, esporta `BookingFormValues` type

- [ ] **Step 1: Scrivi il componente**

```typescript
// src/components/eventi/booking-form.tsx
"use client";

import { useState } from "react";
import { InlineMessage } from "@/components/ui/inline-message";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export interface BookingFormValues {
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
  website: string;
}

interface Props {
  initial?: Partial<Pick<BookingFormValues, "nome" | "cognome" | "telefono" | "email">>;
  showCognome?: boolean;
  onSubmit: (values: BookingFormValues) => Promise<void>;
}

export function BookingForm({ initial, showCognome = true, onSubmit }: Props) {
  const [form, setForm] = useState<BookingFormValues>({
    nome: initial?.nome || "",
    cognome: initial?.cognome || "",
    telefono: initial?.telefono || "",
    email: initial?.email || "",
    website: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || (!form.telefono.trim() && !form.email.trim())) {
      setError("Inserisci il nome e almeno un contatto (telefono o email)");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'invio, riprova.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <InlineMessage variant="error">{error}</InlineMessage>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text" placeholder="Nome *" value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          required className={inputClass}
        />
        {showCognome && (
          <input
            type="text" placeholder="Cognome" value={form.cognome}
            onChange={(e) => setForm({ ...form, cognome: e.target.value })}
            className={inputClass}
          />
        )}
        <input
          type="tel" placeholder="Telefono" value={form.telefono}
          onChange={(e) => setForm({ ...form, telefono: e.target.value })}
          className={inputClass}
        />
        <input
          type="email" placeholder="Email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className={inputClass}
        />
      </div>
      <input
        type="text"
        value={form.website}
        onChange={(e) => setForm({ ...form, website: e.target.value })}
        tabIndex={-1}
        autoComplete="off"
        className="absolute -left-[9999px] w-px h-px opacity-0"
        aria-hidden="true"
      />
      <button
        type="submit" disabled={submitting}
        className="w-full py-3 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
      >
        {submitting ? "Invio..." : "Prenota il tuo posto"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/components/eventi/booking-form.tsx
git commit -m "feat(prenotazione): componente BookingForm condiviso"
```

---

## Task 10: Pagina pubblica `/prenota/[token]`

**Files:**
- Create: `src/app/prenota/[token]/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/prenota/[token]` (Task 7), `<BookingForm>` (Task 9)

- [ ] **Step 1: Scrivi la pagina**

```typescript
// src/app/prenota/[token]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Calendar, MapPin } from "lucide-react";
import { InlineMessage } from "@/components/ui/inline-message";
import { BookingForm, type BookingFormValues } from "@/components/eventi/booking-form";

interface EventoPubblico {
  id: string;
  nome: string;
  descrizione: string | null;
  data_inizio: string;
  location: string | null;
  location_url: string | null;
  modalita: string | null;
  prezzo: number | null;
  locandina_url: string | null;
  link_evento: string | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function PrenotaPage() {
  const { token } = useParams<{ token: string }>();
  const [evento, setEvento] = useState<EventoPubblico | null>(null);
  const [postiRimasti, setPostiRimasti] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [esito, setEsito] = useState<"confermato" | "in_attesa" | null>(null);

  useEffect(() => {
    fetch(`/api/prenota/${token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) { setError(d.error || "Link non valido"); return; }
        setEvento(d.evento);
        setPostiRimasti(d.postiRimasti);
      })
      .catch(() => setError("Errore di caricamento. Riprova più tardi."))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(values: BookingFormValues) {
    const res = await fetch(`/api/prenota/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Errore durante l'invio, riprova.");
    setEsito(data.stato);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !evento) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-main px-4 min-h-screen">
        <div className="w-full max-w-md text-center bg-bg-card border border-border rounded-2xl p-8">
          <InlineMessage variant="warning">{error || "Evento non disponibile."}</InlineMessage>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen bg-bg-main px-4 py-10 overflow-y-auto">
      <div className="w-full max-w-md mx-auto">
        {evento.locandina_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={evento.locandina_url} alt={evento.nome} className="w-full max-h-56 object-cover rounded-2xl mb-4" />
        )}
        <div className="bg-bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-divider">
            <h1 className="text-lg font-bold text-text-primary mb-2">{evento.nome}</h1>
            {evento.descrizione && <p className="text-sm text-text-secondary mb-3">{evento.descrizione}</p>}
            <div className="flex items-center gap-2 text-sm text-text-primary mb-1">
              <Calendar size={14} strokeWidth={1.75} className="text-accent shrink-0" />
              {formatDate(evento.data_inizio)}
            </div>
            {evento.location && (
              <div className="flex items-center gap-2 text-sm text-text-primary">
                <MapPin size={14} strokeWidth={1.75} className="text-accent shrink-0" />
                {evento.location}
              </div>
            )}
            {postiRimasti !== null && (
              <p className="text-xs text-text-secondary mt-2">
                {postiRimasti > 0
                  ? `${postiRimasti} posti rimasti`
                  : "Posti esauriti — nuove prenotazioni in lista d'attesa"}
              </p>
            )}
          </div>

          <div className="p-6">
            {esito ? (
              <InlineMessage variant={esito === "confermato" ? "success" : "warning"}>
                {esito === "confermato"
                  ? "Prenotazione confermata! Ti aspettiamo."
                  : "Sei in lista d'attesa: ti contatteremo se si libera un posto."}
              </InlineMessage>
            ) : (
              <BookingForm onSubmit={handleSubmit} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Verifica manuale nel browser**

Con `npm run dev` attivo, apri `http://localhost:3000/prenota/<TOKEN>` (token dal Task 6) in incognito:
- Verifica che nome evento/data/location/posti rimasti siano corretti
- Compila e invia il form → verifica messaggio di conferma a schermo
- Verifica ricezione email (se hai configurato `RESEND_API_KEY` in locale) o controlla i log server per l'eventuale errore di invio (non deve bloccare la risposta HTTP)
- Prova un token inesistente → verifica messaggio "Link non valido"

- [ ] **Step 4: Commit**

```bash
git add src/app/prenota/
git commit -m "feat(prenotazione): pagina pubblica /prenota/[token]"
```

---

## Task 11: Pagina di prenotazione dalla vetrina + CTA

**Files:**
- Create: `src/app/anteprima/[token]/eventi/[id]/page.tsx`
- Modify: `src/app/anteprima/[token]/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/anteprima/[token]/eventi/[id]` (Task 8), `<BookingForm>` (Task 9)

- [ ] **Step 1: Scrivi la sotto-pagina**

```typescript
// src/app/anteprima/[token]/eventi/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Calendar, MapPin, ArrowLeft } from "lucide-react";
import { InlineMessage } from "@/components/ui/inline-message";
import { BookingForm, type BookingFormValues } from "@/components/eventi/booking-form";

interface EventoPubblico {
  id: string;
  nome: string;
  descrizione: string | null;
  data_inizio: string;
  location: string | null;
  location_url: string | null;
  modalita: string | null;
  prezzo: number | null;
  locandina_url: string | null;
  link_evento: string | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AnteprimaEventoPrenotaPage() {
  const { token, id } = useParams<{ token: string; id: string }>();
  const [evento, setEvento] = useState<EventoPubblico | null>(null);
  const [postiRimasti, setPostiRimasti] = useState<number | null>(null);
  const [prospect, setProspect] = useState<{ nome: string; telefono: string | null; email: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [esito, setEsito] = useState<"confermato" | "in_attesa" | null>(null);

  useEffect(() => {
    fetch(`/api/anteprima/${token}/eventi/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) { setError(d.error || "Link non valido"); return; }
        setEvento(d.evento);
        setPostiRimasti(d.postiRimasti);
        setProspect(d.prospect);
      })
      .catch(() => setError("Errore di caricamento. Riprova più tardi."))
      .finally(() => setLoading(false));
  }, [token, id]);

  async function handleSubmit(values: BookingFormValues) {
    const res = await fetch(`/api/anteprima/${token}/eventi/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: values.nome, telefono: values.telefono, email: values.email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Errore durante l'invio, riprova.");
    setEsito(data.stato);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !evento) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-main px-4 min-h-screen">
        <div className="w-full max-w-md text-center bg-bg-card border border-border rounded-2xl p-8">
          <InlineMessage variant="warning">{error || "Evento non disponibile."}</InlineMessage>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen bg-bg-main px-4 py-10 overflow-y-auto">
      <div className="w-full max-w-md mx-auto">
        <Link href={`/anteprima/${token}`} className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-4">
          <ArrowLeft size={14} strokeWidth={1.75} /> Torna alla vetrina
        </Link>
        {evento.locandina_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={evento.locandina_url} alt={evento.nome} className="w-full max-h-56 object-cover rounded-2xl mb-4" />
        )}
        <div className="bg-bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-divider">
            <h1 className="text-lg font-bold text-text-primary mb-2">{evento.nome}</h1>
            {evento.descrizione && <p className="text-sm text-text-secondary mb-3">{evento.descrizione}</p>}
            <div className="flex items-center gap-2 text-sm text-text-primary mb-1">
              <Calendar size={14} strokeWidth={1.75} className="text-accent shrink-0" />
              {formatDate(evento.data_inizio)}
            </div>
            {evento.location && (
              <div className="flex items-center gap-2 text-sm text-text-primary">
                <MapPin size={14} strokeWidth={1.75} className="text-accent shrink-0" />
                {evento.location}
              </div>
            )}
            {postiRimasti !== null && (
              <p className="text-xs text-text-secondary mt-2">
                {postiRimasti > 0
                  ? `${postiRimasti} posti rimasti`
                  : "Posti esauriti — nuove prenotazioni in lista d'attesa"}
              </p>
            )}
          </div>

          <div className="p-6">
            {esito ? (
              <InlineMessage variant={esito === "confermato" ? "success" : "warning"}>
                {esito === "confermato"
                  ? "Prenotazione confermata! Ti aspettiamo."
                  : "Sei in lista d'attesa: ti contatteremo se si libera un posto."}
              </InlineMessage>
            ) : (
              <BookingForm
                initial={{ nome: prospect?.nome || "", telefono: prospect?.telefono || "", email: prospect?.email || "" }}
                showCognome={false}
                onSubmit={handleSubmit}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Aggiungi la CTA "Prenota" nella lista eventi della vetrina**

In `src/app/anteprima/[token]/page.tsx`, aggiungi l'import di `Link` da `next/link` in cima al file (dopo l'import di `useParams`):

```typescript
import Link from "next/link";
```

Poi sostituisci il blocco della card evento (dentro `{data.eventi.map((e) => (...))}`):

```typescript
                <div key={e.id} className="bg-bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar size={14} strokeWidth={1.75} className="text-accent" />
                    <p className="font-semibold text-sm text-text-primary">{e.nome}</p>
                  </div>
                  <p className="text-xs text-text-secondary">{formatDate(e.data_inizio)}</p>
                  {e.location && (
                    <p className="text-xs text-text-secondary flex items-center gap-1 mt-1">
                      <MapPin size={12} strokeWidth={1.75} /> {e.location}
                    </p>
                  )}
                  <Link
                    href={`/anteprima/${token}/eventi/${e.id}`}
                    className="mt-2 inline-block text-xs font-semibold text-accent hover:underline"
                  >
                    Prenota il tuo posto →
                  </Link>
                </div>
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 4: Verifica manuale nel browser**

Apri `/anteprima/<TOKEN_VETRINA>`, verifica che ogni evento mostri "Prenota il tuo posto →", cliccalo, verifica che il form arrivi precompilato con i dati del prospect e che il submit funzioni.

- [ ] **Step 5: Commit**

```bash
git add src/app/anteprima/
git commit -m "feat(prenotazione): pagina prenotazione da vetrina + CTA nella lista eventi"
```

---

## Task 12: Lista iscritti organizzatore unificata (partner + prospect)

**Files:**
- Modify: `src/app/api/events/[id]/attendees/route.ts`

**Interfaces:**
- Produces: `GET /api/events/[id]/attendees` → `{ attendees: AttendeeRow[], confermati: number, inAttesa: number }` (era `{ attendees: EventAttendee[], confermati: number }`)

- [ ] **Step 1: Sostituisci il contenuto del file**

```typescript
// src/app/api/events/[id]/attendees/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canViewAttendees } from "@/lib/auth/roles";
import type { AttendeeRow } from "@/lib/types/events";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: evento } = await supabase
    .from("events").select("creato_da").eq("id", id).single();
  if (!evento) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(admin, user.id);
  if (!canViewAttendees(ruolo, qualifica, evento.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const [{ data: partnerAttendees, error: partnerErr }, { data: prospectBookings, error: prospectErr }] = await Promise.all([
    admin
      .from("event_attendees")
      .select(`*, profile:profiles!user_id(nome, email, telefono)`)
      .eq("event_id", id)
      .order("responded_at", { ascending: false }),
    admin
      .from("event_prospect_bookings")
      .select(`*, prospect:prospects!prospect_id(nome, telefono, email, partner:profiles!partner_id(nome))`)
      .eq("event_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (partnerErr) return NextResponse.json({ error: partnerErr.message }, { status: 500 });
  if (prospectErr) return NextResponse.json({ error: prospectErr.message }, { status: 500 });

  type PartnerAttendeeRow = { user_id: string; stato: string; profile: { nome: string; email: string; telefono: string | null } | null };
  type ProspectBookingRow = { prospect_id: string; stato: string; prospect: { nome: string; telefono: string | null; email: string | null; partner: { nome: string } | null } | null };

  const attendees: AttendeeRow[] = [
    ...((partnerAttendees || []) as PartnerAttendeeRow[]).map((a) => ({
      tipo: "partner" as const,
      id: a.user_id,
      nome: a.profile?.nome || "",
      email: a.profile?.email || null,
      telefono: a.profile?.telefono || null,
      stato: a.stato as AttendeeRow["stato"],
    })),
    ...((prospectBookings || []) as ProspectBookingRow[]).map((b) => ({
      tipo: "prospect" as const,
      id: b.prospect_id,
      nome: b.prospect?.nome || "",
      email: b.prospect?.email || null,
      telefono: b.prospect?.telefono || null,
      stato: b.stato as AttendeeRow["stato"],
      partnerNome: b.prospect?.partner?.nome,
    })),
  ];

  const confermati = attendees.filter((a) => a.stato === "confermato").length;
  const inAttesa = attendees.filter((a) => a.stato === "in_attesa").length;

  return NextResponse.json({ attendees, confermati, inAttesa });
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Verifica manuale con curl**

Con lo stesso cookie di sessione del Task 6:

```bash
curl http://localhost:3000/api/events/<ID_EVENTO>/attendees \
  -H "Cookie: <cookie-sessione>"
```
Expected: `attendees` contiene sia righe `tipo:"partner"` sia `tipo:"prospect"` (se hai fatto le prenotazioni di test dei task precedenti su questo evento), con `partnerNome` valorizzato sulle righe prospect. `confermati`/`inAttesa` coerenti.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/events/\[id\]/attendees/route.ts
git commit -m "feat(prenotazione): unifica lista iscritti partner+prospect nell'API attendees"
```

---

## Task 13: UI dettaglio evento — link prenotazione + lista unificata

**Files:**
- Create: `src/components/eventi/event-booking-link-card.tsx`
- Modify: `src/app/(dashboard)/eventi/[id]/page.tsx`

**Interfaces:**
- Consumes: `POST /api/events/[id]/booking-link` (Task 6), `GET /api/events/[id]/attendees` esteso (Task 12), `AttendeeRow`/`BOOKING_BADGE`/`BOOKING_LABELS` (Task 1)

- [ ] **Step 1: Crea il componente QR/copia link**

```typescript
// src/components/eventi/event-booking-link-card.tsx
"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type Props = { url: string };

export function EventBookingLinkCard({ url }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((mod) => {
      const QRCode = (mod.default ?? mod) as typeof import("qrcode");
      QRCode.toDataURL(url, { width: 320, margin: 2 }).then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      });
    });
    return () => { cancelled = true; };
  }, [url]);

  function copyLink() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        Link pubblico per questo evento: chi lo apre può prenotarsi anche senza essere già un tuo contatto.
      </p>
      <div className="flex gap-2">
        <input readOnly value={url} className="w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none" />
        <button onClick={copyLink} className="px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all shrink-0">
          {copied ? "Copiato!" : "Copia"}
        </button>
      </div>
      {qrDataUrl && (
        <div className="flex flex-col items-center gap-2 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR prenotazione evento" className="w-40 h-40 rounded-xl border border-border" />
          <a href={qrDataUrl} download="weshare-qr-prenotazione.png" className="flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            <Download size={14} strokeWidth={2} /> Scarica PNG
          </a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Aggiorna gli import in `src/app/(dashboard)/eventi/[id]/page.tsx`**

Sostituisci (righe 1-14):

```typescript
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Calendar, MapPin, ExternalLink, Users, Edit, Trash2,
  MessageCircle, Copy, Send, Eye, Link2,
} from "lucide-react";
import {
  type Evento, type AttendeeRow, type RsvpStato,
  MODALITA_LABELS, MODALITA_BADGE, RSVP_LABELS, RSVP_BADGE,
  BOOKING_LABELS, BOOKING_BADGE,
} from "@/lib/types/events";
import { buildWaLink, buildBroadcastText } from "@/lib/events/whatsapp";
import { EVENT_CREATOR_QUALIFICHE, HIGH_VISIBILITY_QUALIFICHE } from "@/lib/auth/roles";
import { EventBookingLinkCard } from "@/components/eventi/event-booking-link-card";
```

- [ ] **Step 3: Aggiorna lo state e il fetch degli iscritti**

Sostituisci (righe 28-38, i due state `attendees`/`confermati` e le variabili di stato del modal):

```typescript
  const [evento, setEvento] = useState<Evento | null>(null);
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [confermati, setConfermati] = useState(0);
  const [inAttesa, setInAttesa] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [canViewAttendeesList, setCanViewAttendeesList] = useState(false);
  const [canSendReminderBtn, setCanSendReminderBtn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rsvpSaving, setRsvpSaving] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bookingLinkUrl, setBookingLinkUrl] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
```

Sostituisci il secondo `useEffect` (righe 63-68):

```typescript
  useEffect(() => {
    if (!canViewAttendeesList || !evento) return;
    fetch(`/api/events/${id}/attendees`)
      .then((r) => r.json())
      .then((d) => {
        setAttendees(d.attendees || []);
        setConfermati(d.confermati || 0);
        setInAttesa(d.inAttesa || 0);
      });
  }, [canViewAttendeesList, evento, id]);
```

- [ ] **Step 4: Aggiungi l'handler per generare il link**

Aggiungi dopo `handleDelete` (dopo riga 89):

```typescript
  async function handleGenerateBookingLink() {
    setGeneratingLink(true);
    const res = await fetch(`/api/events/${id}/booking-link`, { method: "POST" });
    const data = await res.json();
    if (res.ok) setBookingLinkUrl(data.url);
    setGeneratingLink(false);
  }
```

- [ ] **Step 5: Aggiungi il bottone "Genera link" nell'header (accanto a Modifica/Elimina)**

Sostituisci il blocco `{canManage && (...)}` dentro l'header evento (righe 156-173):

```typescript
          {canManage && (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleGenerateBookingLink}
                disabled={generatingLink}
                title="Genera link prenotazione pubblico"
                className="p-2 rounded-xl border border-border hover:bg-bg-section transition-colors disabled:opacity-50"
              >
                <Link2 size={16} strokeWidth={1.75} className="text-text-secondary" />
              </button>
              <button
                onClick={() => router.push(`/eventi/${id}/modifica`)}
                title="Modifica"
                className="p-2 rounded-xl border border-border hover:bg-bg-section transition-colors"
              >
                <Edit size={16} strokeWidth={1.75} className="text-text-secondary" />
              </button>
              <button
                onClick={handleDelete}
                title="Elimina"
                className="p-2 rounded-xl border border-border hover:bg-[#fee2e2] transition-colors"
              >
                <Trash2 size={16} strokeWidth={1.75} className="text-[#991b1b]" />
              </button>
            </div>
          )}
```

- [ ] **Step 6: Aggiorna il conteggio iscritti e la tabella per usare le righe unificate**

Sostituisci l'header della sezione iscritti (righe 243-248, solo il blocco `<h2>`, non toccare il `<div>` che lo contiene né il commento `{/* Reminder actions */}` subito dopo):

```typescript
            <h2 className="font-semibold text-text-primary flex items-center gap-2">
              <Users size={16} strokeWidth={1.75} className="text-accent" />
              Iscritti
              <span className="text-sm font-normal text-text-secondary">
                ({confermati} confermati{inAttesa > 0 ? `, ${inAttesa} in lista d'attesa` : ""}{evento.capienza_max ? ` / ${evento.capienza_max}` : ""})
              </span>
            </h2>
```

Sostituisci il blocco mobile (righe 285-310):

```typescript
              {/* Mobile */}
              <div className="md:hidden space-y-2">
                {attendees.map((a) => (
                  <div key={`${a.tipo}-${a.id}`} className="flex items-center justify-between p-3 bg-bg-section rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{a.nome}</p>
                      <p className="text-xs text-text-secondary">
                        {a.email}
                        {a.tipo === "prospect" && a.partnerNome && ` · contatto di ${a.partnerNome}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        a.tipo === "partner" ? RSVP_BADGE[a.stato as RsvpStato] : BOOKING_BADGE[a.stato as "confermato" | "in_attesa" | "annullato"]
                      }`}>
                        {a.tipo === "partner" ? RSVP_LABELS[a.stato as RsvpStato] : BOOKING_LABELS[a.stato as "confermato" | "in_attesa" | "annullato"]}
                      </span>
                      {a.telefono && (
                        <a
                          href={buildWaLink(a.telefono, a.nome, evento)}
                          target="_blank"
                          rel="noopener"
                          className="p-1.5 rounded-lg bg-[#25D366] text-white"
                        >
                          <MessageCircle size={13} strokeWidth={1.75} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
```

Sostituisci il blocco desktop (righe 312-348):

```typescript
              {/* Desktop */}
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="border-b border-divider">
                    {["Nome","Email","Riferimento","Stato","WA"].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-text-secondary px-3 py-2 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendees.map((a) => (
                    <tr key={`${a.tipo}-${a.id}`} className="border-b border-divider last:border-0">
                      <td className="px-3 py-2.5 font-medium text-text-primary">{a.nome}</td>
                      <td className="px-3 py-2.5 text-text-secondary">{a.email}</td>
                      <td className="px-3 py-2.5 text-text-secondary">
                        {a.tipo === "partner" ? "Partner" : (a.partnerNome ? `Contatto di ${a.partnerNome}` : "Prospect")}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          a.tipo === "partner" ? RSVP_BADGE[a.stato as RsvpStato] : BOOKING_BADGE[a.stato as "confermato" | "in_attesa" | "annullato"]
                        }`}>
                          {a.tipo === "partner" ? RSVP_LABELS[a.stato as RsvpStato] : BOOKING_LABELS[a.stato as "confermato" | "in_attesa" | "annullato"]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {a.telefono ? (
                          <a
                            href={buildWaLink(a.telefono, a.nome, evento)}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1 text-xs bg-[#25D366] text-white px-2 py-1 rounded-lg"
                          >
                            <MessageCircle size={12} strokeWidth={1.75} /> WA
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
```

- [ ] **Step 7: Aggiungi il modal del link prenotazione**

Aggiungi subito prima del commento `{/* Modal preview email */}` esistente (riga 354):

```typescript
      {/* Modal link prenotazione */}
      {bookingLinkUrl && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-text-primary">Link prenotazione pubblico</h3>
              <button onClick={() => setBookingLinkUrl(null)} className="text-text-secondary hover:text-text-primary">✕</button>
            </div>
            <div className="p-4">
              <EventBookingLinkCard url={bookingLinkUrl} />
            </div>
          </div>
        </div>
      )}

```

- [ ] **Step 8: Lint**

Run: `npm run lint`
Expected: nessun errore. Se ESLint segnala `a.stato` non assegnabile a `RsvpStato`/tipo booking per via del tipo union `AttendeeRow["stato"]`, verificare che i cast `as RsvpStato` / `as "confermato" | "in_attesa" | "annullato"` introdotti sopra risolvano — sono lì apposta per restringere il tipo union in base a `a.tipo`.

- [ ] **Step 9: Verifica manuale nel browser**

Apri `/eventi/<ID_EVENTO>` come organizzatore:
- Bottone link (icona catena) accanto a Modifica/Elimina → click → modal con URL, QR, copia
- Sezione iscritti mostra sia le righe partner sia quelle prospect create nei task precedenti, con colonna "Riferimento" e badge stato corretti (incluso "In lista d'attesa" se presente)
- Bottone WhatsApp funziona anche sulle righe prospect (usa `a.telefono`)

- [ ] **Step 10: Commit**

```bash
git add src/components/eventi/event-booking-link-card.tsx "src/app/(dashboard)/eventi/[id]/page.tsx"
git commit -m "feat(prenotazione): UI dettaglio evento — link pubblico + lista iscritti unificata"
```

---

## Self-Review (svolto durante la stesura)

**Copertura spec**: dati (Task 1), dedup prospect (Task 2), capienza/lista d'attesa (Task 3), email conferma (Task 4), middleware (Task 5), link pubblico per evento (Task 6+10), flusso vetrina (Task 8+11), lista organizzatore unificata con partner di riferimento (Task 12+13) — tutte le sezioni dello spec hanno un task corrispondente. Reminder 24h/2h esplicitamente non toccato, come da scope.

**Placeholder**: nessun TODO/TBD; ogni step ha codice completo, nessun "simile al task N" senza ripetere il codice.

**Coerenza tipi**: `AttendeeRow.stato` è union `RsvpStato | BookingStato` — i cast espliciti nel Task 13 (Step 6) sono necessari perché TypeScript non restringe automaticamente in base al campo `tipo` per un valore letto da JSON; verificato che `BOOKING_BADGE`/`BOOKING_LABELS` (Task 1) coprano anche `"annullato"` anche se non usato in UI, per compatibilità di tipo con `BookingStato`.
