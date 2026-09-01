# Sessione B — Gestione Eventi: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare CRUD eventi, RSVP, lista iscritti, upload locandina, email reminder automatici (7gg+1gg) e manuali, template email globale + per-evento, preview HTML, WhatsApp singolo e broadcast, Vercel Cron.

**Architecture:** Next.js App Router (client components + API routes), Supabase PostgreSQL con RLS, Supabase Storage bucket `event-covers`, Resend per email, `wa.me` per WhatsApp, Vercel Cron Job protetto da `CRON_SECRET`.

**Tech Stack:** Next.js 15, TypeScript, Tailwind v4 (Ocean Pro tokens), Supabase JS v2, Resend SDK, Lucide React, Canvas API (resize client-side).

## Global Constraints

- Ocean Pro tokens ovunque: `bg-bg-card`, `text-text-primary`, `bg-accent`, `--op-navy #0B2545`, `--op-blue #1D6FA4` — mai hex hardcoded nei nuovi componenti
- Icone Lucide: `size={18} strokeWidth={1.75}` per sidebar/liste, `size={20}` per CTA
- Mobile-first: card su mobile, tabella `md+`
- `"use client"` in cima a tutti i componenti interattivi
- Sempre `supabase.auth.getUser()` PRIMA di qualsiasi logica nelle API routes
- Ruoli: `topadmin/admin/coadmin/incaricato/nuovo_iscritto/prospect` — Qualifiche: `nessuna/silver/gold/platino/smeraldo/diamante` — sono concetti separati
- Pattern API route: `createClient()` da `@/lib/supabase/server`, error → `NextResponse.json({ error: msg }, { status: N })`
- No test framework installato — verifica via `curl` per API e browser per UI
- Dominio produzione: `https://weshare.growset.it`

---

## Task 1: Migration 006 + Storage bucket

**Files:**
- Create: `supabase/migrations/006_eventi.sql`
- Modify: `src/lib/auth/roles.ts` (aggiunta tipi qualifica + helper)

**Interfaces:**
- Produce: tabelle `events`, `event_attendees` in Supabase; bucket `event-covers`; funzioni `getUserQualifica`, `canCreateEvent`, `canManageEvent` in `roles.ts`

- [ ] **Step 1: Crea il file migration**

```sql
-- supabase/migrations/006_eventi.sql

-- events (IF NOT EXISTS: già presente in Supabase via SQL editor)
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
  testo_reminder TEXT,
  reminder_sent_7d BOOLEAN DEFAULT false,
  reminder_sent_1d BOOLEAN DEFAULT false,
  visibilita TEXT NOT NULL CHECK (visibilita IN ('globale','gruppo')) DEFAULT 'gruppo',
  platino_id UUID REFERENCES public.profiles(id),
  creato_da UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aggiungi colonne mancanti se la tabella esisteva già
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
        OR public.get_user_role() IN ('admin','topadmin')
        OR public.get_user_qualifica() IN ('diamante','smeraldo')
      )
    )
  );

CREATE POLICY events_insert ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    creato_da = auth.uid()
    AND (
      public.get_user_role() IN ('admin','topadmin')
      OR public.get_user_qualifica() IN ('diamante','smeraldo','platino')
    )
  );

CREATE POLICY events_update ON public.events FOR UPDATE TO authenticated
  USING (
    creato_da = auth.uid()
    OR public.get_user_role() IN ('admin','topadmin')
  );

CREATE POLICY events_delete ON public.events FOR DELETE TO authenticated
  USING (
    creato_da = auth.uid()
    OR public.get_user_role() IN ('admin','topadmin')
  );

-- RLS event_attendees
ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY attendees_own ON public.event_attendees FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY attendees_read_organizer ON public.event_attendees FOR SELECT TO authenticated
  USING (
    event_id IN (SELECT id FROM public.events WHERE creato_da = auth.uid())
    OR public.get_user_role() IN ('admin','topadmin')
    OR public.get_user_qualifica() IN ('diamante','smeraldo')
  );

-- Trigger updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'events_updated_at'
  ) THEN
    CREATE TRIGGER events_updated_at
      BEFORE UPDATE ON public.events
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- Storage bucket event-covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-covers', 'event-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "event_covers_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'event-covers');

CREATE POLICY "event_covers_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-covers');

CREATE POLICY "event_covers_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'event-covers');
```

- [ ] **Step 2: Applica la migration su Supabase**

Vai su [supabase.com/dashboard/project/ietxuhkkahnvcbchfspt/sql/new](https://supabase.com/dashboard/project/ietxuhkkahnvcbchfspt/sql/new), incolla il contenuto di `006_eventi.sql` e clicca Run.

Verifica: vai su Table Editor → vedi `events` e `event_attendees` con le colonne corrette. Storage → `event-covers` bucket presente.

- [ ] **Step 3: Aggiorna `src/lib/auth/roles.ts`**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export type UserRole =
  | "topadmin"
  | "admin"
  | "coadmin"
  | "incaricato"
  | "nuovo_iscritto"
  | "prospect";

export type UserQualifica =
  | "nessuna"
  | "silver"
  | "gold"
  | "platino"
  | "smeraldo"
  | "diamante";

export const ADMIN_ROLES: UserRole[] = ["topadmin", "admin"];
export const EVENT_CREATOR_QUALIFICHE: UserQualifica[] = ["platino", "smeraldo", "diamante"];
export const EVENT_ORGANIZER_QUALIFICHE: UserQualifica[] = ["platino", "smeraldo", "diamante"];

export function isAdminRole(ruolo: UserRole | null | undefined): boolean {
  return !!ruolo && ADMIN_ROLES.includes(ruolo);
}

export function canCreateEvent(
  ruolo: UserRole | null,
  qualifica: UserQualifica | null
): boolean {
  return (
    isAdminRole(ruolo) ||
    (!!qualifica && EVENT_CREATOR_QUALIFICHE.includes(qualifica))
  );
}

export function canManageEvent(
  ruolo: UserRole | null,
  qualifica: UserQualifica | null,
  createdBy: string,
  userId: string
): boolean {
  return createdBy === userId || isAdminRole(ruolo);
}

export function canViewAttendees(
  ruolo: UserRole | null,
  qualifica: UserQualifica | null,
  createdBy: string,
  userId: string
): boolean {
  return (
    createdBy === userId ||
    isAdminRole(ruolo) ||
    (!!qualifica && ["smeraldo", "diamante"].includes(qualifica))
  );
}

export function canSendReminder(
  ruolo: UserRole | null,
  qualifica: UserQualifica | null,
  createdBy: string,
  userId: string
): boolean {
  return (
    createdBy === userId ||
    isAdminRole(ruolo) ||
    (!!qualifica && EVENT_CREATOR_QUALIFICHE.includes(qualifica))
  );
}

export async function getUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<UserRole | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("ruolo")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return data.ruolo as UserRole;
}

export async function getUserQualifica(
  supabase: SupabaseClient,
  userId: string
): Promise<UserQualifica | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("qualifica")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return data.qualifica as UserQualifica;
}

export async function getUserRoleAndQualifica(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ruolo: UserRole | null; qualifica: UserQualifica | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("ruolo, qualifica")
    .eq("id", userId)
    .single();
  if (error || !data) return { ruolo: null, qualifica: null };
  return {
    ruolo: data.ruolo as UserRole,
    qualifica: data.qualifica as UserQualifica,
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/006_eventi.sql src/lib/auth/roles.ts
git commit -m "feat(eventi): migration 006 + storage bucket + ruolo/qualifica helpers"
```

---

## Task 2: Tipi TypeScript eventi

**Files:**
- Create: `src/lib/types/events.ts`

**Interfaces:**
- Produce: `Evento`, `EventAttendee`, `RsvpStato`, `EventModalita`, `EventVisibilita`, `MODALITA_LABELS`, `MODALITA_BADGE`, `RSVP_LABELS`, `RSVP_BADGE`

- [ ] **Step 1: Crea `src/lib/types/events.ts`**

```typescript
export type EventModalita = "presenza" | "online" | "hybrid";
export type EventVisibilita = "globale" | "gruppo";
export type RsvpStato = "confermato" | "forse" | "annullato";

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
  testo_reminder: string | null;
  reminder_sent_7d: boolean;
  reminder_sent_1d: boolean;
  visibilita: EventVisibilita;
  platino_id: string | null;
  creato_da: string;
  created_at: string;
  updated_at: string;
  // join opzionali (aggiunti dalle API)
  my_rsvp?: RsvpStato | null;
  attendees_count?: number;
}

export interface EventAttendee {
  event_id: string;
  user_id: string;
  stato: RsvpStato;
  responded_at: string;
  profile?: {
    nome: string;
    email: string;
    telefono: string | null;
  };
}

export const MODALITA_LABELS: Record<EventModalita, string> = {
  presenza: "In presenza",
  online: "Online",
  hybrid: "Ibrido",
};

export const MODALITA_BADGE: Record<EventModalita, string> = {
  presenza: "bg-[#dcfce7] text-[#166534]",
  online: "bg-accent-glow text-accent",
  hybrid: "bg-[#fef9c3] text-[#854d0e]",
};

export const RSVP_LABELS: Record<RsvpStato, string> = {
  confermato: "Confermato",
  forse: "Forse",
  annullato: "Annullato",
};

export const RSVP_BADGE: Record<RsvpStato, string> = {
  confermato: "bg-[#dcfce7] text-[#166534]",
  forse: "bg-[#fef9c3] text-[#854d0e]",
  annullato: "bg-[#fee2e2] text-[#991b1b]",
};

export const VISIBILITA_LABELS: Record<EventVisibilita, string> = {
  globale: "Tutti",
  gruppo: "Il mio gruppo",
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types/events.ts
git commit -m "feat(eventi): tipi TypeScript Evento, EventAttendee, badge/label"
```

---

## Task 3: API — CRUD eventi

**Files:**
- Create: `src/app/api/events/route.ts`
- Create: `src/app/api/events/[id]/route.ts`

**Interfaces:**
- Consumes: `getUserRoleAndQualifica`, `canCreateEvent`, `canManageEvent` da `@/lib/auth/roles`; `Evento` da `@/lib/types/events`
- Produce:
  - `GET /api/events` → `{ events: Evento[] }`
  - `POST /api/events` → `{ event: Evento }` (201)
  - `GET /api/events/[id]` → `{ event: Evento }`
  - `PATCH /api/events/[id]` → `{ event: Evento }`
  - `DELETE /api/events/[id]` → `{ ok: true }` (200)

- [ ] **Step 1: Crea `src/app/api/events/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoleAndQualifica, canCreateEvent } from "@/lib/auth/roles";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const tab = request.nextUrl.searchParams.get("tab") || "attivi";
  const now = new Date().toISOString();

  // Due query separate: una per la lista eventi, una per l'RSVP dell'utente corrente.
  // Non si possono unire in una sola perché il filtro .eq("event_attendees.user_id")
  // applicato alla join !left filtrerebbe anche un eventuale secondo riferimento a event_attendees.
  let eventsQuery = supabase
    .from("events")
    .select("*")
    .order("data_inizio", { ascending: tab === "attivi" });

  if (tab === "attivi") {
    eventsQuery = eventsQuery.gte("data_inizio", now);
  } else {
    eventsQuery = eventsQuery.lt("data_inizio", now);
  }

  const { data, error } = await eventsQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Ottieni RSVP utente per gli eventi caricati
  const eventIds = (data || []).map((e: Record<string, unknown>) => e.id as string);
  let rsvpMap: Record<string, string> = {};
  if (eventIds.length > 0) {
    const { data: rsvps } = await supabase
      .from("event_attendees")
      .select("event_id, stato")
      .eq("user_id", user.id)
      .in("event_id", eventIds);
    rsvpMap = Object.fromEntries((rsvps || []).map((r) => [r.event_id, r.stato]));
  }

  const events = (data || []).map((e: Record<string, unknown>) => ({
    ...e,
    my_rsvp: rsvpMap[e.id as string] ?? null,
    attendees_count: 0, // Non calcolato nella lista per performance — visibile nel dettaglio
  }));

  return NextResponse.json({ events });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(supabase, user.id);
  if (!canCreateEvent(ruolo, qualifica)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      nome, descrizione, data_inizio, data_fine, location, location_url,
      modalita, capienza_max, prezzo, link_prenotazione, link_evento,
      visibilita, platino_id, testo_reminder,
    } = body;

    if (!nome?.trim()) return NextResponse.json({ error: "Il nome è obbligatorio" }, { status: 400 });
    if (!data_inizio) return NextResponse.json({ error: "La data di inizio è obbligatoria" }, { status: 400 });

    const { data, error } = await supabase
      .from("events")
      .insert({
        nome: nome.trim(),
        descrizione: descrizione?.trim() || null,
        data_inizio,
        data_fine: data_fine || null,
        location: location?.trim() || null,
        location_url: location_url?.trim() || null,
        modalita: modalita || null,
        capienza_max: capienza_max ? Number(capienza_max) : null,
        prezzo: prezzo ? Number(prezzo) : null,
        link_prenotazione: link_prenotazione?.trim() || null,
        link_evento: link_evento?.trim() || null,
        visibilita: visibilita || "gruppo",
        platino_id: platino_id || null,
        testo_reminder: testo_reminder?.trim() || null,
        creato_da: user.id,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ event: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
```

- [ ] **Step 2: Crea `src/app/api/events/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoleAndQualifica, canManageEvent } from "@/lib/auth/roles";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data, error } = await supabase
    .from("events")
    .select(`
      *,
      my_rsvp:event_attendees!left(stato),
      attendees_count:event_attendees(count)
    `)
    .eq("id", id)
    .eq("event_attendees.user_id", user.id)
    .single();

  if (error) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const event = {
    ...data,
    my_rsvp: Array.isArray(data.my_rsvp) && data.my_rsvp.length > 0
      ? (data.my_rsvp as Array<{stato: string}>)[0].stato
      : null,
    attendees_count: Array.isArray(data.attendees_count)
      ? (data.attendees_count as Array<{count: number}>)[0]?.count ?? 0
      : 0,
  };

  return NextResponse.json({ event });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: existing } = await supabase
    .from("events").select("creato_da").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(supabase, user.id);
  if (!canManageEvent(ruolo, qualifica, existing.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const allowed = [
      "nome","descrizione","data_inizio","data_fine","location","location_url",
      "modalita","capienza_max","prezzo","link_prenotazione","link_evento",
      "visibilita","platino_id","testo_reminder",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await supabase
      .from("events").update(updates).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ event: data });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: existing } = await supabase
    .from("events").select("creato_da").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(supabase, user.id);
  if (!canManageEvent(ruolo, qualifica, existing.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verifica API con curl**

Prima logga con il tuo utente (`alessandro@iseven.it`) e ottieni il token dalla dev tools (Network → qualsiasi request → Authorization header). Poi:

```bash
# GET lista eventi
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/events

# POST crea evento di test
curl -X POST http://localhost:3000/api/events \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Test Evento","data_inizio":"2026-07-15T19:00:00Z","visibilita":"globale"}'
# → 201 con { event: { id: "...", nome: "Test Evento", ... } }

# Prendi l'id dalla risposta precedente e verifica GET
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/events/<id>
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/events/route.ts src/app/api/events/[id]/route.ts
git commit -m "feat(eventi): API CRUD eventi — GET lista/dettaglio, POST, PATCH, DELETE"
```

---

## Task 4: API — Cover upload

**Files:**
- Create: `src/app/api/events/[id]/cover/route.ts`

**Interfaces:**
- Consumes: Supabase Storage bucket `event-covers`; `canManageEvent` da `@/lib/auth/roles`
- Produce:
  - `POST /api/events/[id]/cover` (multipart) → `{ locandina_url: string }`
  - `DELETE /api/events/[id]/cover` → `{ ok: true }`

- [ ] **Step 1: Crea `src/app/api/events/[id]/cover/route.ts`**

```typescript
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: existing } = await supabase
    .from("events").select("creato_da, locandina_url").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(supabase, user.id);
  if (!canManageEvent(ruolo, qualifica, existing.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "File mancante" }, { status: 400 });

  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Formato non supportato (jpeg/png/webp)" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File troppo grande (max 5MB)" }, { status: 400 });
  }

  const admin = createAdminClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${id}/cover.${ext}`;

  // Rimuovi cover precedente se esiste
  if (existing.locandina_url) {
    await admin.storage.from("event-covers").remove([`${id}/cover.jpg`, `${id}/cover.png`, `${id}/cover.webp`]);
  }

  const buffer = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from("event-covers")
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage
    .from("event-covers").getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("events").update({ locandina_url: publicUrl }).eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ locandina_url: publicUrl });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: existing } = await supabase
    .from("events").select("creato_da").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(supabase, user.id);
  if (!canManageEvent(ruolo, qualifica, existing.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const admin = createAdminClient();
  await admin.storage.from("event-covers").remove([
    `${id}/cover.jpg`, `${id}/cover.png`, `${id}/cover.webp`
  ]);

  await supabase.from("events").update({ locandina_url: null }).eq("id", id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/events/[id]/cover/route.ts
git commit -m "feat(eventi): API cover upload/delete — Supabase Storage event-covers"
```

---

## Task 5: API — RSVP + attendees

**Files:**
- Create: `src/app/api/events/[id]/rsvp/route.ts`
- Create: `src/app/api/events/[id]/attendees/route.ts`

**Interfaces:**
- Produce:
  - `POST /api/events/[id]/rsvp` body `{ stato }` → `{ attendee: EventAttendee }`
  - `GET /api/events/[id]/attendees` → `{ attendees: EventAttendee[], confermati: number }`

- [ ] **Step 1: Crea `src/app/api/events/[id]/rsvp/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RsvpStato } from "@/lib/types/events";

const STATI_VALIDI: RsvpStato[] = ["confermato", "forse", "annullato"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  try {
    const { stato } = await request.json() as { stato: RsvpStato };
    if (!STATI_VALIDI.includes(stato)) {
      return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("event_attendees")
      .upsert(
        { event_id: id, user_id: user.id, stato, responded_at: new Date().toISOString() },
        { onConflict: "event_id,user_id" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ attendee: data });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
```

- [ ] **Step 2: Crea `src/app/api/events/[id]/attendees/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoleAndQualifica, canViewAttendees } from "@/lib/auth/roles";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: evento } = await supabase
    .from("events").select("creato_da").eq("id", id).single();
  if (!evento) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(supabase, user.id);
  if (!canViewAttendees(ruolo, qualifica, evento.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("event_attendees")
    .select(`
      *,
      profile:profiles!user_id(nome, email, telefono)
    `)
    .eq("event_id", id)
    .order("responded_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const attendees = data || [];
  const confermati = attendees.filter((a) => a.stato === "confermato").length;

  return NextResponse.json({ attendees, confermati });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/events/[id]/rsvp/route.ts src/app/api/events/[id]/attendees/route.ts
git commit -m "feat(eventi): API RSVP (upsert) e lista iscritti con join profile"
```

---

## Task 6: Email helpers + remind API

**Files:**
- Create: `src/lib/events/email.ts`
- Create: `src/app/api/events/[id]/remind/route.ts`
- Create: `src/app/api/events/[id]/remind-preview/route.ts`
- Create: `src/app/api/settings/email-template/route.ts`

**Interfaces:**
- Consumes: `Resend` SDK (`resend` package — già in package.json? Se no: `npm i resend`)
- Produce:
  - `buildReminderEmail(evento, attendeeName, globalTemplate?)` → `{ subject: string; html: string }`
  - `POST /api/events/[id]/remind` → `{ sent: number }`
  - `GET /api/events/[id]/remind-preview` → `{ subject: string; html: string }`
  - `GET /api/settings/email-template` → `{ template: string }`
  - `POST /api/settings/email-template` → `{ ok: true }`

- [ ] **Step 1: Verifica Resend in package.json**

```bash
grep "resend" /Users/alejerry/Desktop/WeShare/package.json
```

Se non c'è: `npm i resend` nella cartella WeShare.

- [ ] **Step 2: Crea `src/lib/events/email.ts`**

```typescript
import type { Evento } from "@/lib/types/events";

export const DEFAULT_EMAIL_TEMPLATE = `
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
              <p style="margin:0 0 16px;color:#0B2545;font-size:16px">Ciao <strong>{nome}</strong>!</p>
              {{#if locandina_url}}
              <img src="{locandina_url}" alt="{nome_evento}" style="width:100%;border-radius:8px;margin-bottom:24px;display:block">
              {{/if}}
              <h2 style="margin:0 0 16px;color:#0B2545;font-size:20px">{nome_evento}</h2>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px">
                <tr><td style="padding:4px 0;color:#4A6480;font-size:14px">📅</td><td style="padding:4px 8px;color:#0B2545;font-size:14px"><strong>{data}</strong> alle <strong>{ora}</strong></td></tr>
                {{#if location}}<tr><td style="padding:4px 0;color:#4A6480;font-size:14px">📍</td><td style="padding:4px 8px;color:#0B2545;font-size:14px">{location}</td></tr>{{/if}}
                {{#if link_evento}}<tr><td style="padding:4px 0;color:#4A6480;font-size:14px">🔗</td><td style="padding:4px 8px"><a href="{link_evento}" style="color:#1D6FA4">Collegamento evento</a></td></tr>{{/if}}
              </table>
              {{#if testo_reminder}}
              <div style="background:#E6F1FB;border-left:4px solid #1D6FA4;padding:16px;border-radius:0 8px 8px 0;margin-bottom:24px">
                <p style="margin:0;color:#0C447C;font-size:14px">{testo_reminder}</p>
              </div>
              {{/if}}
              <a href="{link_app}" style="display:inline-block;background:#1D6FA4;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Vedi dettagli evento</a>
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function applyTemplate(template: string, vars: Record<string, string | null | undefined>): string {
  let result = template;
  // Gestisci {{#if var}}...{{/if}}
  result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, content) => {
    return vars[key] ? content : "";
  });
  // Sostituisci variabili
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value || "");
  }
  return result;
}

export function buildReminderEmail(
  evento: Evento,
  attendeeName: string,
  daysAhead: 1 | 7,
  globalTemplate?: string | null
): { subject: string; html: string } {
  const template = globalTemplate || DEFAULT_EMAIL_TEMPLATE;
  const subject = daysAhead === 7
    ? `${evento.nome} è tra 7 giorni!`
    : `Reminder: ${evento.nome} è domani!`;

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

- [ ] **Step 3: Crea `src/app/api/events/[id]/remind/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { getUserRoleAndQualifica, canSendReminder } from "@/lib/auth/roles";
import { buildReminderEmail } from "@/lib/events/email";
import type { Evento } from "@/lib/types/events";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: evento } = await supabase
    .from("events").select("*").eq("id", id).single();
  if (!evento) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(supabase, user.id);
  if (!canSendReminder(ruolo, qualifica, evento.creato_da, user.id)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  // Carica template globale da system_flags
  const { data: flagData } = await supabase
    .from("system_flags").select("value").eq("key", "email_reminder_template").single();
  const globalTemplate = flagData?.value as string | null;

  const { data: attendees } = await supabase
    .from("event_attendees")
    .select("*, profile:profiles!user_id(nome, email)")
    .eq("event_id", id)
    .eq("stato", "confermato");

  if (!attendees?.length) return NextResponse.json({ sent: 0 });

  let sent = 0;
  for (const a of attendees) {
    const profile = a.profile as { nome: string; email: string } | null;
    if (!profile?.email) continue;
    const { subject, html } = buildReminderEmail(evento as Evento, profile.nome, 1, globalTemplate);
    const { error } = await resend.emails.send({
      from: "WeShare <noreply@growset.it>",
      to: profile.email,
      subject,
      html,
    });
    if (!error) sent++;
  }

  return NextResponse.json({ sent });
}
```

- [ ] **Step 4: Crea `src/app/api/events/[id]/remind-preview/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildReminderEmail } from "@/lib/events/email";
import type { Evento } from "@/lib/types/events";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: evento } = await supabase
    .from("events").select("*").eq("id", id).single();
  if (!evento) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });

  const { data: profile } = await supabase
    .from("profiles").select("nome").eq("id", user.id).single();

  const { data: flagData } = await supabase
    .from("system_flags").select("value").eq("key", "email_reminder_template").single();
  const globalTemplate = flagData?.value as string | null;

  const { subject, html } = buildReminderEmail(
    evento as Evento,
    (profile as { nome: string } | null)?.nome || "Partner",
    1,
    globalTemplate
  );

  return NextResponse.json({ subject, html });
}
```

- [ ] **Step 5: Crea `src/app/api/settings/email-template/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth/roles";

export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data } = await supabase
    .from("system_flags").select("value").eq("key", "email_reminder_template").single();

  return NextResponse.json({ template: data?.value || null });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const ruolo = await getUserRole(supabase, user.id);
  if (!isAdminRole(ruolo)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { template } = await request.json();
  await supabase.from("system_flags").upsert(
    { key: "email_reminder_template", value: template },
    { onConflict: "key" }
  );

  return NextResponse.json({ ok: true });
}
```

**Nota:** verifica che la tabella `system_flags` abbia una colonna `value TEXT`. Se ha solo colonne booleane, controlla lo schema con `\d system_flags` nel SQL editor Supabase e aggiungi `ALTER TABLE system_flags ADD COLUMN IF NOT EXISTS value TEXT;` se necessario.

- [ ] **Step 6: Controlla la struttura di system_flags e aggiungi colonna value se mancante**

Nel SQL editor Supabase:
```sql
ALTER TABLE public.system_flags ADD COLUMN IF NOT EXISTS value TEXT;
```

- [ ] **Step 7: Controlla RESEND_API_KEY in env**

```bash
grep "RESEND" /Users/alejerry/Desktop/WeShare/.env.local
```

Se non c'è, aggiungila (la trovi su resend.com/api-keys).

- [ ] **Step 8: Commit**

```bash
git add src/lib/events/email.ts \
        src/app/api/events/[id]/remind/route.ts \
        src/app/api/events/[id]/remind-preview/route.ts \
        src/app/api/settings/email-template/route.ts
git commit -m "feat(eventi): email helper, API remind on-demand, preview, settings template"
```

---

## Task 7: WhatsApp helpers

**Files:**
- Create: `src/lib/events/whatsapp.ts`

**Interfaces:**
- Produce: `buildWaLink(telefono, evento)` → `string`; `buildBroadcastText(evento, postiRimasti)` → `string`

- [ ] **Step 1: Crea `src/lib/events/whatsapp.ts`**

```typescript
import type { Evento } from "@/lib/types/events";

function formatDateIT(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function formatTimeIT(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export function buildWaLink(telefono: string, nome: string, evento: Evento): string {
  const lines = [
    `Ciao ${nome}! 👋`,
    `Ti ricordo l'evento *${evento.nome}*`,
    `📅 ${formatDateIT(evento.data_inizio)} alle ${formatTimeIT(evento.data_inizio)}`,
  ];
  if (evento.location) lines.push(`📍 ${evento.location}`);
  if (evento.link_evento) lines.push(`🔗 ${evento.link_evento}`);
  lines.push("Ti aspettiamo! 🙌");

  const text = encodeURIComponent(lines.join("\n"));
  const phone = telefono.replace(/\D/g, "");
  const fullPhone = phone.startsWith("39") ? phone : `39${phone}`;
  return `https://wa.me/${fullPhone}?text=${text}`;
}

export function buildBroadcastText(evento: Evento, postiRimasti: number | null): string {
  const lines = [
    `📢 *${evento.nome}*`,
    "",
  ];
  if (evento.descrizione) lines.push(evento.descrizione, "");
  lines.push(`📅 ${formatDateIT(evento.data_inizio)} alle ${formatTimeIT(evento.data_inizio)}`);
  if (evento.location) lines.push(`📍 ${evento.location}`);
  if (postiRimasti !== null && postiRimasti > 0) {
    lines.push(`🎟️ Posti disponibili: ${postiRimasti}`);
  }
  const link = evento.link_prenotazione || evento.link_evento;
  if (link) lines.push(`🔗 ${link}`);
  lines.push(
    "",
    `👉 Iscriviti su WeShare: https://weshare.growset.it/eventi/${evento.id}`,
    "",
    "_WeShare · powered by Me.To.Do for you®_"
  );
  return lines.join("\n");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/events/whatsapp.ts
git commit -m "feat(eventi): WhatsApp helpers — wa.me singolo e testo broadcast gruppo"
```

---

## Task 8: Vercel Cron — email reminder automatici

**Files:**
- Create: `src/app/api/cron/event-reminders/route.ts`
- Create/Modify: `vercel.json`

**Interfaces:**
- Consumes: `buildReminderEmail` da `@/lib/events/email`; `Resend` SDK; `createAdminClient` da `@/lib/supabase/admin`
- Produce: cron attivo su Vercel che ogni mattina alle 07:00 UTC manda email 7gg e 1gg prima

- [ ] **Step 1: Aggiungi CRON_SECRET alle env var**

In `.env.local` aggiungi:
```
CRON_SECRET=<stringa-random-almeno-32-chars>
```

Genera con: `openssl rand -hex 32`

Poi vai su Vercel → Settings → Environment Variables → aggiungi `CRON_SECRET` con lo stesso valore (Production + Preview).

- [ ] **Step 2: Crea `src/app/api/cron/event-reminders/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReminderEmail } from "@/lib/events/email";
import type { Evento } from "@/lib/types/events";

const resend = new Resend(process.env.RESEND_API_KEY);

function getDayRange(daysAhead: number): { from: string; to: string } {
  const target = new Date();
  target.setDate(target.getDate() + daysAhead);
  const from = new Date(target);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(target);
  to.setUTCHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function sendRemindersForDay(
  supabase: ReturnType<typeof createAdminClient>,
  daysAhead: 1 | 7,
  globalTemplate: string | null
): Promise<number> {
  const { from, to } = getDayRange(daysAhead);
  const flagField = daysAhead === 7 ? "reminder_sent_7d" : "reminder_sent_1d";

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .gte("data_inizio", from)
    .lte("data_inizio", to)
    .eq(flagField, false);

  if (!events?.length) return 0;

  let total = 0;
  for (const evento of events) {
    const { data: attendees } = await supabase
      .from("event_attendees")
      .select("*, profile:profiles!user_id(nome, email)")
      .eq("event_id", evento.id)
      .eq("stato", "confermato");

    for (const a of attendees || []) {
      const profile = a.profile as { nome: string; email: string } | null;
      if (!profile?.email) continue;
      const { subject, html } = buildReminderEmail(
        evento as Evento, profile.nome, daysAhead, globalTemplate
      );
      const { error } = await resend.emails.send({
        from: "WeShare <noreply@growset.it>",
        to: profile.email,
        subject,
        html,
      });
      if (!error) total++;
    }

    // Segna il flag per evitare doppi invii
    await supabase.from("events").update({ [flagField]: true }).eq("id", evento.id);
  }

  return total;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: flagData } = await supabase
    .from("system_flags").select("value").eq("key", "email_reminder_template").single();
  const globalTemplate = flagData?.value as string | null;

  const sent7d = await sendRemindersForDay(supabase, 7, globalTemplate);
  const sent1d = await sendRemindersForDay(supabase, 1, globalTemplate);

  console.log(`[cron/event-reminders] sent: ${sent7d} (7gg) + ${sent1d} (1gg)`);
  return NextResponse.json({ sent_7d: sent7d, sent_1d: sent1d });
}
```

- [ ] **Step 3: Crea/aggiorna `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/event-reminders",
      "schedule": "0 7 * * *"
    }
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/event-reminders/route.ts vercel.json
git commit -m "feat(eventi): Vercel Cron 07:00 UTC — reminder email 7gg e 1gg prima, anti-doppio flag"
```

---

## Task 9: Pagina lista `/eventi`

**Files:**
- Modify: `src/app/api/auth/me/route.ts`
- Create: `src/app/(dashboard)/eventi/page.tsx`

**Interfaces:**
- Consumes: `GET /api/events?tab=attivi|storico`; `GET /api/auth/me` (esteso con `ruolo` + `qualifica`); tipi `Evento`, `MODALITA_LABELS`, `MODALITA_BADGE`, `RSVP_LABELS`, `RSVP_BADGE`, `VISIBILITA_LABELS` da `@/lib/types/events`; `canCreateEvent` da `@/lib/auth/roles`

- [ ] **Step 1: Aggiorna `src/app/api/auth/me/route.ts` per restituire `ruolo` e `qualifica`**

Il file attuale restituisce solo `{ user: { id, email }, role, isAdmin }`. I componenti eventi hanno bisogno di `ruolo` e `qualifica` per i controlli permessi lato client.

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null, role: null, ruolo: null, qualifica: null, isAdmin: false });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ruolo, qualifica")
    .eq("id", user.id)
    .single();

  const ruolo = profile?.ruolo ?? null;
  const qualifica = profile?.qualifica ?? null;

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    role: ruolo,
    ruolo,
    qualifica,
    isAdmin: isAdminRole(ruolo),
  });
}
```

- [ ] **Step 2: Crea `src/app/(dashboard)/eventi/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Plus, MapPin, Users } from "lucide-react";
import { canCreateEvent } from "@/lib/auth/roles";
import {
  type Evento, type RsvpStato,
  MODALITA_LABELS, MODALITA_BADGE, RSVP_LABELS, RSVP_BADGE, VISIBILITA_LABELS,
} from "@/lib/types/events";

type Tab = "attivi" | "storico";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function EventiPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("attivi");
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setCanCreate(canCreateEvent(d.ruolo, d.qualifica));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchEventi();
  }, [tab]);

  async function fetchEventi() {
    setLoading(true);
    const res = await fetch(`/api/events?tab=${tab}`);
    const data = await res.json();
    setEventi(data.events || []);
    setLoading(false);
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar size={22} strokeWidth={1.75} className="text-accent" />
          <h1 className="text-xl font-bold text-text-primary">Eventi</h1>
        </div>
        {canCreate && (
          <button
            onClick={() => router.push("/eventi/nuovo")}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={16} strokeWidth={2} />
            Nuovo evento
          </button>
        )}
      </div>

      {/* Tab */}
      <div className="flex gap-1 mb-4 bg-bg-section rounded-xl p-1 w-fit">
        {(["attivi", "storico"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? "bg-white text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t === "attivi" ? "Attivi" : "Storico"}
          </button>
        ))}
      </div>

      {loading && <p className="text-text-secondary text-sm py-8 text-center">Caricamento…</p>}

      {!loading && eventi.length === 0 && (
        <div className="text-center py-16 text-text-secondary">
          <Calendar size={40} strokeWidth={1} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nessun evento {tab === "attivi" ? "in programma" : "nel passato"}</p>
        </div>
      )}

      {/* Mobile: card */}
      {!loading && eventi.length > 0 && (
        <>
          <div className="md:hidden space-y-3">
            {eventi.map((e) => (
              <button
                key={e.id}
                onClick={() => router.push(`/eventi/${e.id}`)}
                className="w-full text-left bg-bg-card rounded-2xl p-4 border border-divider hover:border-accent/30 transition-colors"
              >
                {e.locandina_url && (
                  <img src={e.locandina_url} alt={e.nome} className="w-full h-32 object-cover rounded-xl mb-3" />
                )}
                <p className="font-semibold text-text-primary text-sm mb-1">{e.nome}</p>
                <p className="text-xs text-text-secondary mb-2">{formatDate(e.data_inizio)}</p>
                {e.location && (
                  <p className="text-xs text-text-secondary flex items-center gap-1 mb-2">
                    <MapPin size={12} strokeWidth={1.75} /> {e.location}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {e.modalita && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODALITA_BADGE[e.modalita]}`}>
                      {MODALITA_LABELS[e.modalita]}
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-bg-section text-text-secondary">
                    {VISIBILITA_LABELS[e.visibilita]}
                  </span>
                  {e.my_rsvp && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RSVP_BADGE[e.my_rsvp as RsvpStato]}`}>
                      {RSVP_LABELS[e.my_rsvp as RsvpStato]}
                    </span>
                  )}
                  {e.capienza_max && (
                    <span className="text-xs text-text-secondary flex items-center gap-1 ml-auto">
                      <Users size={12} strokeWidth={1.75} /> {e.attendees_count}/{e.capienza_max}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Desktop: tabella */}
          <div className="hidden md:block bg-bg-card rounded-2xl border border-divider overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-divider">
                  {["Evento","Data","Luogo","Modalità","Iscritti","Il tuo RSVP"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-text-secondary px-4 py-3 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventi.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => router.push(`/eventi/${e.id}`)}
                    className="border-b border-divider last:border-0 hover:bg-bg-section cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">{e.nome}</td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{formatDate(e.data_inizio)}</td>
                    <td className="px-4 py-3 text-text-secondary">{e.location || "—"}</td>
                    <td className="px-4 py-3">
                      {e.modalita ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODALITA_BADGE[e.modalita]}`}>
                          {MODALITA_LABELS[e.modalita]}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {e.capienza_max ? `${e.attendees_count}/${e.capienza_max}` : e.attendees_count || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {e.my_rsvp ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RSVP_BADGE[e.my_rsvp as RsvpStato]}`}>
                          {RSVP_LABELS[e.my_rsvp as RsvpStato]}
                        </span>
                      ) : <span className="text-text-secondary">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
```

**Nota:** l'endpoint `GET /api/auth/me` già esiste nel progetto e restituisce ruolo e qualifica dell'utente.

- [ ] **Step 2: Verifica in browser**

`npm run dev` → vai su `http://localhost:3000/eventi`. Verifica tab Attivi/Storico, bottone "+ Nuovo evento" visibile solo per admin/diamante/platino.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/eventi/page.tsx
git commit -m "feat(eventi): pagina lista /eventi — tab Attivi/Storico, card mobile, tabella desktop"
```

---

## Task 10: Pagina form `/eventi/nuovo` e `/eventi/[id]/modifica`

**Files:**
- Create: `src/app/(dashboard)/eventi/nuovo/page.tsx`
- Create: `src/app/(dashboard)/eventi/[id]/modifica/page.tsx`
- Create: `src/components/eventi/event-form.tsx` (form condiviso)

**Interfaces:**
- Consumes: `POST /api/events`, `PATCH /api/events/[id]`, `POST /api/events/[id]/cover`; tipi `Evento`, `EventModalita`, `EventVisibilita`; `canCreateEvent` da `@/lib/auth/roles`

- [ ] **Step 1: Crea `src/components/eventi/event-form.tsx`**

```tsx
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import type { Evento, EventModalita, EventVisibilita } from "@/lib/types/events";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const labelClass = "block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1";

interface EventFormProps {
  initial?: Partial<Evento>;
  onSubmit: (data: Partial<Evento>) => Promise<{ id: string }>;
  submitLabel: string;
}

async function resizeImage(file: File, maxPx = 1200): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85);
    };
    img.src = URL.createObjectURL(file);
  });
}

export function EventForm({ initial, onSubmit, submitLabel }: EventFormProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(initial?.locandina_url || null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    nome: initial?.nome || "",
    descrizione: initial?.descrizione || "",
    data_inizio: initial?.data_inizio ? initial.data_inizio.slice(0, 16) : "",
    data_fine: initial?.data_fine ? initial.data_fine.slice(0, 16) : "",
    location: initial?.location || "",
    location_url: initial?.location_url || "",
    modalita: (initial?.modalita || "") as EventModalita | "",
    capienza_max: initial?.capienza_max?.toString() || "",
    prezzo: initial?.prezzo?.toString() || "",
    link_prenotazione: initial?.link_prenotazione || "",
    link_evento: initial?.link_evento || "",
    visibilita: (initial?.visibilita || "gruppo") as EventVisibilita,
    platino_id: initial?.platino_id || "",
    testo_reminder: initial?.testo_reminder || "",
  });

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCoverChange(file: File) {
    const resized = await resizeImage(file);
    const preview = URL.createObjectURL(resized);
    setCoverPreview(preview);
    setCoverFile(new File([resized], "cover.jpg", { type: "image/jpeg" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || !form.data_inizio) return;
    setSaving(true);
    try {
      const payload: Partial<Evento> = {
        nome: form.nome.trim(),
        descrizione: form.descrizione.trim() || null,
        data_inizio: new Date(form.data_inizio).toISOString(),
        data_fine: form.data_fine ? new Date(form.data_fine).toISOString() : null,
        location: form.location.trim() || null,
        location_url: form.location_url.trim() || null,
        modalita: (form.modalita || null) as EventModalita | null,
        capienza_max: form.capienza_max ? Number(form.capienza_max) : null,
        prezzo: form.prezzo ? Number(form.prezzo) : null,
        link_prenotazione: form.link_prenotazione.trim() || null,
        link_evento: form.link_evento.trim() || null,
        visibilita: form.visibilita,
        platino_id: form.platino_id || null,
        testo_reminder: form.testo_reminder.trim() || null,
      };

      const { id } = await onSubmit(payload);

      // Upload locandina se presente
      if (coverFile) {
        const fd = new FormData();
        fd.append("file", coverFile);
        await fetch(`/api/events/${id}/cover`, { method: "POST", body: fd });
      }

      router.push(`/eventi/${id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Locandina */}
      <div>
        <label className={labelClass}>Locandina</label>
        {coverPreview ? (
          <div className="relative w-full max-w-sm">
            <img src={coverPreview} className="w-full rounded-xl object-cover max-h-48" alt="Preview" />
            <button
              type="button"
              onClick={() => { setCoverPreview(null); setCoverFile(null); }}
              className="absolute top-2 right-2 bg-white rounded-full p-1 shadow"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full max-w-sm h-32 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-text-secondary hover:border-accent/50 transition-colors"
          >
            <Upload size={20} strokeWidth={1.75} />
            <span className="text-xs">Clicca o trascina un'immagine</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleCoverChange(e.target.files[0])}
        />
      </div>

      {/* Nome */}
      <div>
        <label className={labelClass}>Nome evento *</label>
        <input className={inputClass} value={form.nome} onChange={(e) => set("nome", e.target.value)} required />
      </div>

      {/* Descrizione */}
      <div>
        <label className={labelClass}>Descrizione</label>
        <textarea className={inputClass} rows={3} value={form.descrizione} onChange={(e) => set("descrizione", e.target.value)} />
      </div>

      {/* Date */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Data e ora inizio *</label>
          <input type="datetime-local" className={inputClass} value={form.data_inizio} onChange={(e) => set("data_inizio", e.target.value)} required />
        </div>
        <div>
          <label className={labelClass}>Data e ora fine</label>
          <input type="datetime-local" className={inputClass} value={form.data_fine} onChange={(e) => set("data_fine", e.target.value)} />
        </div>
      </div>

      {/* Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Luogo</label>
          <input className={inputClass} placeholder="es. Hotel Milano, Sala A" value={form.location} onChange={(e) => set("location", e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Link Maps</label>
          <input className={inputClass} type="url" placeholder="https://maps.google.com/..." value={form.location_url} onChange={(e) => set("location_url", e.target.value)} />
        </div>
      </div>

      {/* Modalità + Capienza */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Modalità</label>
          <select className={inputClass} value={form.modalita} onChange={(e) => set("modalita", e.target.value)}>
            <option value="">— Seleziona —</option>
            <option value="presenza">In presenza</option>
            <option value="online">Online</option>
            <option value="hybrid">Ibrido</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Capienza max</label>
          <input className={inputClass} type="number" min={1} value={form.capienza_max} onChange={(e) => set("capienza_max", e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Prezzo (€)</label>
          <input className={inputClass} type="number" min={0} step={0.01} value={form.prezzo} onChange={(e) => set("prezzo", e.target.value)} />
        </div>
      </div>

      {/* Link */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Link prenotazione</label>
          <input className={inputClass} type="url" placeholder="https://..." value={form.link_prenotazione} onChange={(e) => set("link_prenotazione", e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Link evento (Zoom/Meet)</label>
          <input className={inputClass} type="url" placeholder="https://zoom.us/..." value={form.link_evento} onChange={(e) => set("link_evento", e.target.value)} />
        </div>
      </div>

      {/* Visibilità */}
      <div>
        <label className={labelClass}>Visibilità</label>
        <div className="flex gap-3">
          {(["globale", "gruppo"] as EventVisibilita[]).map((v) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="visibilita"
                value={v}
                checked={form.visibilita === v}
                onChange={() => set("visibilita", v)}
                className="accent-accent"
              />
              <span className="text-sm text-text-primary">
                {v === "globale" ? "Tutti" : "Solo il mio gruppo"}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Testo reminder personalizzato */}
      <div>
        <label className={labelClass}>Messaggio personalizzato nei reminder</label>
        <textarea
          className={inputClass}
          rows={2}
          placeholder="Es: Ricordati di portare il catalogo e i campioni SA8!"
          value={form.testo_reminder}
          onChange={(e) => set("testo_reminder", e.target.value)}
        />
        <p className="text-xs text-text-secondary mt-1">Verrà aggiunto in evidenza nelle email di reminder.</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-accent hover:bg-accent-hover text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-text-secondary hover:text-text-primary text-sm px-4 py-2.5 rounded-xl border border-border transition-colors"
        >
          Annulla
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Crea `src/app/(dashboard)/eventi/nuovo/page.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { EventForm } from "@/components/eventi/event-form";
import type { Evento } from "@/lib/types/events";

export default function NuovoEventoPage() {
  const router = useRouter();

  async function handleSubmit(data: Partial<Evento>) {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Errore creazione evento");
    }
    const { event } = await res.json();
    return { id: event.id };
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-text-primary mb-6">Nuovo evento</h1>
      <div className="bg-bg-card rounded-2xl border border-divider p-6">
        <EventForm onSubmit={handleSubmit} submitLabel="Crea evento" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Crea `src/app/(dashboard)/eventi/[id]/modifica/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { EventForm } from "@/components/eventi/event-form";
import type { Evento } from "@/lib/types/events";

export default function ModificaEventoPage() {
  const { id } = useParams<{ id: string }>();
  const [evento, setEvento] = useState<Evento | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/events/${id}`)
      .then((r) => r.json())
      .then((d) => { setEvento(d.event); setLoading(false); });
  }, [id]);

  async function handleSubmit(data: Partial<Evento>) {
    const res = await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Errore aggiornamento evento");
    }
    return { id };
  }

  if (loading) return <div className="p-6 text-text-secondary text-sm">Caricamento…</div>;
  if (!evento) return <div className="p-6 text-text-secondary text-sm">Evento non trovato.</div>;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-text-primary mb-6">Modifica evento</h1>
      <div className="bg-bg-card rounded-2xl border border-divider p-6">
        <EventForm initial={evento} onSubmit={handleSubmit} submitLabel="Salva modifiche" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verifica in browser**

`npm run dev` → `/eventi/nuovo` → compila il form, crea un evento → redirect a `/eventi/[id]` (che ancora non esiste, andrà in not-found, è ok per ora).

- [ ] **Step 5: Commit**

```bash
git add src/components/eventi/event-form.tsx \
        src/app/(dashboard)/eventi/nuovo/page.tsx \
        src/app/(dashboard)/eventi/[id]/modifica/page.tsx
git commit -m "feat(eventi): form creazione/modifica evento con upload locandina Canvas resize"
```

---

## Task 11: Pagina dettaglio `/eventi/[id]`

**Files:**
- Create: `src/app/(dashboard)/eventi/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/events/[id]`; `GET /api/events/[id]/attendees`; `POST /api/events/[id]/rsvp`; `POST /api/events/[id]/remind`; `GET /api/events/[id]/remind-preview`; `buildWaLink`, `buildBroadcastText` da `@/lib/events/whatsapp`; tipi da `@/lib/types/events`

- [ ] **Step 1: Crea `src/app/(dashboard)/eventi/[id]/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Calendar, MapPin, ExternalLink, Users, Edit, Trash2,
  Mail, MessageCircle, Copy, Send, Eye,
} from "lucide-react";
import {
  type Evento, type EventAttendee, type RsvpStato,
  MODALITA_LABELS, MODALITA_BADGE, RSVP_LABELS, RSVP_BADGE,
} from "@/lib/types/events";
import { buildWaLink, buildBroadcastText } from "@/lib/events/whatsapp";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function EventoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [evento, setEvento] = useState<Evento | null>(null);
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [confermati, setConfermati] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [canViewAttendees, setCanViewAttendees] = useState(false);
  const [canSendReminder, setCanSendReminder] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpSaving, setRsvpSaving] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/events/${id}`).then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()),
    ]).then(([evData, meData]) => {
      const e: Evento = evData.event;
      setEvento(e);
      setUserId(meData.user?.id ?? null);
      const isCreator = meData.user?.id === e.creato_da;
      const isAdmin = ["topadmin", "admin"].includes(meData.ruolo);
      const isHighQualifica = ["smeraldo", "diamante"].includes(meData.qualifica);
      const isEventCreator = ["platino", "smeraldo", "diamante"].includes(meData.qualifica) || isAdmin;
      setCanManage(isCreator || isAdmin);
      setCanViewAttendees(isCreator || isAdmin || isHighQualifica);
      setCanSendReminder(isCreator || isAdmin || isEventCreator);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!canViewAttendees || !evento) return;
    fetch(`/api/events/${id}/attendees`)
      .then((r) => r.json())
      .then((d) => { setAttendees(d.attendees || []); setConfermati(d.confermati || 0); });
  }, [canViewAttendees, evento, id]);

  async function handleRsvp(stato: RsvpStato) {
    if (!evento) return;
    setRsvpSaving(true);
    const res = await fetch(`/api/events/${id}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato }),
    });
    if (res.ok) {
      setEvento((e) => e ? { ...e, my_rsvp: stato } : e);
      showToast(`RSVP aggiornato: ${RSVP_LABELS[stato]}`);
    }
    setRsvpSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Eliminare questo evento?")) return;
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    router.push("/eventi");
  }

  async function handleSendReminder() {
    setReminderSending(true);
    const res = await fetch(`/api/events/${id}/remind`, { method: "POST" });
    const data = await res.json();
    showToast(`Reminder inviato a ${data.sent} iscritti`);
    setReminderSending(false);
  }

  async function handlePreview() {
    const res = await fetch(`/api/events/${id}/remind-preview`);
    const data = await res.json();
    setPreviewHtml(data.html);
  }

  function handleCopyBroadcast() {
    if (!evento) return;
    const postiRimasti = evento.capienza_max ? evento.capienza_max - confermati : null;
    const text = buildBroadcastText(evento, postiRimasti);
    navigator.clipboard.writeText(text);
    showToast("Testo copiato negli appunti!");
  }

  if (loading) return <div className="p-6 text-text-secondary text-sm">Caricamento…</div>;
  if (!evento) return <div className="p-6 text-text-secondary text-sm">Evento non trovato.</div>;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#0B2545] text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Locandina */}
      {evento.locandina_url && (
        <img src={evento.locandina_url} alt={evento.nome} className="w-full max-h-64 object-cover rounded-2xl" />
      )}

      {/* Header */}
      <div className="bg-bg-card rounded-2xl border border-divider p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary mb-2">{evento.nome}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              {evento.modalita && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODALITA_BADGE[evento.modalita]}`}>
                  {MODALITA_LABELS[evento.modalita]}
                </span>
              )}
              {evento.prezzo && evento.prezzo > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-bg-section text-text-secondary">
                  €{evento.prezzo.toLocaleString("it-IT")}
                </span>
              )}
            </div>
          </div>
          {canManage && (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => router.push(`/eventi/${id}/modifica`)}
                className="p-2 rounded-xl border border-border hover:bg-bg-section transition-colors"
              >
                <Edit size={16} strokeWidth={1.75} className="text-text-secondary" />
              </button>
              <button
                onClick={handleDelete}
                className="p-2 rounded-xl border border-border hover:bg-[#fee2e2] transition-colors"
              >
                <Trash2 size={16} strokeWidth={1.75} className="text-[#991b1b]" />
              </button>
            </div>
          )}
        </div>

        {evento.descrizione && (
          <p className="text-sm text-text-secondary mt-3">{evento.descrizione}</p>
        )}

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-text-primary">
            <Calendar size={16} strokeWidth={1.75} className="text-accent shrink-0" />
            <span>{formatDate(evento.data_inizio)} alle {formatTime(evento.data_inizio)}</span>
          </div>
          {evento.location && (
            <div className="flex items-center gap-2 text-sm text-text-primary">
              <MapPin size={16} strokeWidth={1.75} className="text-accent shrink-0" />
              {evento.location_url ? (
                <a href={evento.location_url} target="_blank" rel="noopener" className="text-accent hover:underline">
                  {evento.location}
                </a>
              ) : evento.location}
            </div>
          )}
          {evento.link_evento && (
            <div className="flex items-center gap-2 text-sm">
              <ExternalLink size={16} strokeWidth={1.75} className="text-accent shrink-0" />
              <a href={evento.link_evento} target="_blank" rel="noopener" className="text-accent hover:underline">
                Collegamento evento (Zoom/Meet)
              </a>
            </div>
          )}
          {evento.link_prenotazione && (
            <div className="flex items-center gap-2 text-sm">
              <ExternalLink size={16} strokeWidth={1.75} className="text-accent shrink-0" />
              <a href={evento.link_prenotazione} target="_blank" rel="noopener" className="text-accent hover:underline">
                Link prenotazione
              </a>
            </div>
          )}
        </div>
      </div>

      {/* RSVP */}
      <div className="bg-bg-card rounded-2xl border border-divider p-5">
        <h2 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Users size={16} strokeWidth={1.75} className="text-accent" />
          La tua partecipazione
        </h2>
        <div className="flex gap-2 flex-wrap">
          {(["confermato", "forse", "annullato"] as RsvpStato[]).map((s) => (
            <button
              key={s}
              disabled={rsvpSaving}
              onClick={() => handleRsvp(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                evento.my_rsvp === s
                  ? s === "confermato" ? "bg-[#dcfce7] border-[#166534] text-[#166534]"
                    : s === "forse" ? "bg-[#fef9c3] border-[#854d0e] text-[#854d0e]"
                    : "bg-[#fee2e2] border-[#991b1b] text-[#991b1b]"
                  : "border-border text-text-secondary hover:bg-bg-section"
              }`}
            >
              {RSVP_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Lista iscritti (solo per organizzatori) */}
      {canViewAttendees && (
        <div className="bg-bg-card rounded-2xl border border-divider p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-text-primary flex items-center gap-2">
              <Users size={16} strokeWidth={1.75} className="text-accent" />
              Iscritti
              <span className="text-sm font-normal text-text-secondary">
                ({confermati} confermati{evento.capienza_max ? ` / ${evento.capienza_max}` : ""})
              </span>
            </h2>
            {/* Reminder actions */}
            {canSendReminder && (
              <div className="flex gap-2">
                <button
                  onClick={handlePreview}
                  className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary border border-border px-3 py-1.5 rounded-xl transition-colors"
                >
                  <Eye size={13} strokeWidth={1.75} /> Anteprima email
                </button>
                <button
                  disabled={reminderSending}
                  onClick={handleSendReminder}
                  className="flex items-center gap-1 text-xs bg-accent text-white px-3 py-1.5 rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  <Send size={13} strokeWidth={1.75} />
                  {reminderSending ? "Invio…" : "Invia reminder"}
                </button>
              </div>
            )}
          </div>

          {/* Copia broadcast WA */}
          <button
            onClick={handleCopyBroadcast}
            className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary mb-4 border border-border px-3 py-1.5 rounded-xl transition-colors"
          >
            <Copy size={13} strokeWidth={1.75} />
            Copia testo broadcast WhatsApp
          </button>

          {attendees.length === 0 ? (
            <p className="text-sm text-text-secondary">Nessun iscritto ancora.</p>
          ) : (
            <>
              {/* Mobile */}
              <div className="md:hidden space-y-2">
                {attendees.map((a) => (
                  <div key={a.user_id} className="flex items-center justify-between p-3 bg-bg-section rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{a.profile?.nome}</p>
                      <p className="text-xs text-text-secondary">{a.profile?.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RSVP_BADGE[a.stato]}`}>
                        {RSVP_LABELS[a.stato]}
                      </span>
                      {a.profile?.telefono && (
                        <a
                          href={buildWaLink(a.profile.telefono, a.profile.nome, evento)}
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

              {/* Desktop */}
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="border-b border-divider">
                    {["Nome","Email","Stato","WA"].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-text-secondary px-3 py-2 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendees.map((a) => (
                    <tr key={a.user_id} className="border-b border-divider last:border-0">
                      <td className="px-3 py-2.5 font-medium text-text-primary">{a.profile?.nome}</td>
                      <td className="px-3 py-2.5 text-text-secondary">{a.profile?.email}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RSVP_BADGE[a.stato]}`}>
                          {RSVP_LABELS[a.stato]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {a.profile?.telefono ? (
                          <a
                            href={buildWaLink(a.profile.telefono, a.profile.nome, evento)}
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
            </>
          )}
        </div>
      )}

      {/* Modal preview email */}
      {previewHtml && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-text-primary">Anteprima email reminder</h3>
              <button onClick={() => setPreviewHtml(null)} className="text-text-secondary hover:text-text-primary">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-96 border-0"
                title="Preview email"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verifica in browser**

`npm run dev` → crea un evento → apri `/eventi/[id]` → verifica RSVP, lista iscritti, bottoni reminder (se sei admin).

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/eventi/[id]/page.tsx
git commit -m "feat(eventi): pagina dettaglio — RSVP, lista iscritti, WA links, reminder, preview email"
```

---

## Task 12: Pagina editor template email `/impostazioni/email-template`

**Files:**
- Create: `src/app/(dashboard)/impostazioni/email-template/page.tsx`

**Interfaces:**
- Consumes: `GET /api/settings/email-template`; `POST /api/settings/email-template`; `DEFAULT_EMAIL_TEMPLATE` da `@/lib/events/email`

- [ ] **Step 1: Crea `src/app/(dashboard)/impostazioni/email-template/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Mail, RotateCcw, Eye } from "lucide-react";
import { DEFAULT_EMAIL_TEMPLATE } from "@/lib/events/email";

export default function EmailTemplatePage() {
  const [template, setTemplate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    fetch("/api/settings/email-template")
      .then((r) => r.json())
      .then((d) => {
        setTemplate(d.template || DEFAULT_EMAIL_TEMPLATE);
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/settings/email-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template }),
    });
    setSaving(false);
    showToast("Template salvato!");
  }

  function handleReset() {
    if (!confirm("Ripristinare il template di default?")) return;
    setTemplate(DEFAULT_EMAIL_TEMPLATE);
  }

  if (loading) return <div className="p-6 text-text-secondary text-sm">Caricamento…</div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#0B2545] text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Mail size={20} strokeWidth={1.75} className="text-accent" />
          <h1 className="text-xl font-bold text-text-primary">Template email reminder</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPreview((p) => !p)}
            className="flex items-center gap-1 text-sm text-text-secondary border border-border px-3 py-1.5 rounded-xl hover:bg-bg-section transition-colors"
          >
            <Eye size={14} strokeWidth={1.75} />
            {preview ? "Modifica" : "Anteprima"}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-sm text-text-secondary border border-border px-3 py-1.5 rounded-xl hover:bg-bg-section transition-colors"
          >
            <RotateCcw size={14} strokeWidth={1.75} /> Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-1.5 rounded-xl transition-colors disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </div>

      <div className="bg-bg-card rounded-2xl border border-divider p-5">
        <p className="text-xs text-text-secondary mb-4">
          Variabili disponibili: <code className="bg-bg-section px-1 rounded">{"{nome}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{nome_evento}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{data}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{ora}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{location}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{link_evento}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{locandina_url}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{testo_reminder}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{link_app}"}</code>
          {" | Blocchi condizionali: "}
          <code className="bg-bg-section px-1 rounded">{"{{#if var}}...{{/if}}"}</code>
        </p>

        {preview ? (
          <iframe
            srcDoc={template
              .replace(/{nome}/g, "Mario Rossi")
              .replace(/{nome_evento}/g, "Evento di Esempio")
              .replace(/{data}/g, "lunedì 15 luglio 2026")
              .replace(/{ora}/g, "19:00")
              .replace(/{location}/g, "Hotel Milano")
              .replace(/{link_app}/g, "https://weshare.growset.it/eventi/example")
              .replace(/\{\{#if \w+\}\}[\s\S]*?\{\{\/if\}\}/g, (m) =>
                m.includes("locandina_url") || m.includes("link_evento") ? "" : m
              )
            }
            className="w-full h-[600px] border-0 rounded-xl bg-[#F0F4F8]"
            title="Preview template"
          />
        ) : (
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full h-96 px-4 py-3 rounded-xl text-xs font-mono border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-y"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Aggiorna sidebar per link a impostazioni email (se non già presente)**

In `src/components/sidebar.tsx`, la voce "Impostazioni" al momento è un bottone senza href. Per ora lasciala così — la pagina `/impostazioni/email-template` è accessibile direttamente via URL. Verrà collegata nella Sessione C con la pagina `/impostazioni` completa.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/impostazioni/email-template/page.tsx
git commit -m "feat(eventi): editor template email globale reminder con preview HTML"
```

---

## Task 13: Deploy finale e verifica produzione

- [ ] **Step 1: Aggiungi CRON_SECRET e RESEND_API_KEY a Vercel**

Vai su Vercel → `amway-partner-app` → Settings → Environment Variables:
- `CRON_SECRET` = il valore generato con `openssl rand -hex 32`
- `RESEND_API_KEY` = la tua chiave Resend (se non già presente)

- [ ] **Step 2: Push su branch weshare**

```bash
git push
```

Vercel farà il deploy automatico. Controlla lo stato su Vercel dashboard.

- [ ] **Step 3: Verifica in produzione**

```
1. https://weshare.growset.it/eventi → lista vuota, bottone "+ Nuovo evento" visibile
2. Crea un evento → carica una locandina → conferma redirect a /eventi/[id]
3. Clicca "Confermato" → RSVP salvato, badge aggiornato
4. Apri "Anteprima email" → modal con HTML
5. Clic "Copia testo broadcast WhatsApp" → testo negli appunti
6. https://weshare.growset.it/impostazioni/email-template → editor visibile solo a admin
```

- [ ] **Step 4: Test cron manuale**

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
  https://weshare.growset.it/api/cron/event-reminders
# → { sent_7d: 0, sent_1d: 0 } (nessun evento domani/tra 7gg per ora)
```

- [ ] **Step 5: Commit finale se ci sono fix minori**

```bash
git add -p  # solo file modificati post-verifica
git commit -m "fix(eventi): correzioni post-deploy produzione"
git push
```

---

## Self-Review — Copertura spec

| Requisito spec | Task |
|---|---|
| Tabella events + event_attendees + RLS | Task 1 |
| Bucket event-covers Storage | Task 1 |
| getUserQualifica + canCreateEvent helpers | Task 1 |
| Tipi TypeScript + label/badge | Task 2 |
| GET/POST /api/events | Task 3 |
| GET/PATCH/DELETE /api/events/[id] | Task 3 |
| POST/DELETE /api/events/[id]/cover | Task 4 |
| POST /api/events/[id]/rsvp | Task 5 |
| GET /api/events/[id]/attendees | Task 5 |
| Template email globale (DEFAULT_EMAIL_TEMPLATE) | Task 6 |
| Testo per-evento (testo_reminder) | Task 6 |
| POST /api/events/[id]/remind (manuale) | Task 6 |
| GET /api/events/[id]/remind-preview | Task 6 |
| GET/POST /api/settings/email-template | Task 6 |
| buildWaLink (singolo iscritto) | Task 7 |
| buildBroadcastText (copia gruppo) | Task 7 |
| Vercel Cron 07:00 UTC, 7gg + 1gg | Task 8 |
| Flag anti-doppio invio reminder_sent_7d/1d | Task 8 |
| Pagina /eventi lista — tab + mobile/desktop | Task 9 |
| Pagina /eventi/nuovo — form + locandina | Task 10 |
| Pagina /eventi/[id]/modifica | Task 10 |
| Pagina /eventi/[id] — RSVP + attendees + WA + remind | Task 11 |
| Modal anteprima email | Task 11 |
| Bottone WA singolo iscritto (wa.me) | Task 11 |
| Bottone "Copia broadcast" gruppo | Task 11 |
| Pagina /impostazioni/email-template | Task 12 |
| CRON_SECRET env var Vercel | Task 13 |
| Deploy + verifica produzione | Task 13 |

Tutti i requisiti della spec sono coperti.
