# Prospect Management — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add appointments, follow-up messaging, and a follow-up worklist to the prospect pipeline — all via prefilled native-app links (Google Calendar URL, `mailto:`, `wa.me`), with a per-prospect detail page hosting the new sections.

**Architecture:** Phase 2 has **zero external dependencies and zero new credentials**. Appointments and messages are stored in Postgres; the calendar/email/WhatsApp actions are client-generated prefilled links that open the partner's own apps (decisions made 2026-06-20: "Add to Calendar" link instead of OAuth — OAuth columns reserved for the future; `mailto:` instead of Resend auto-send). A new detail page `/contatti/[id]` becomes the single edit surface (the Phase 1 list edit-modal is removed). A `/contatti/follow-up` worklist lets the partner triage who to contact with a send/don't-send/suspended flag.

**Tech Stack:** Next.js 16 (App Router, TS), Supabase (Postgres + RLS), Tailwind v4, lucide-react.

**Verification note:** No test framework in this repo (per Phase 1). Verify each task with `npm run lint` (new files must be clean; 19 pre-existing lint problems in other files are out of scope), `npm run build`, and manual checks on the dev server. Treat clean build + lint + the stated manual check as the "tests pass" gate.

**Scope boundary:** Phase 2 only. NO Google Calendar OAuth/auto-sync (link only; `google_event_id`/`google_sync_status` columns reserved for a future sub-phase). NO Resend auto-send (mailto link only). NO conversion to customer/partner (Phase 3). NO analytics (Phase 3).

---

## Prerequisites

- Phase 1 is merged and deployed; `prospects` table exists (migration 007).
- Working from repo root `/Users/alejerry/Desktop/Amway.Partner` on branch `AMWAY.partner`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `supabase/migrations/008_prospect_appointments_messages.sql` | `prospect_appointments` + `prospect_messages` tables; `follow_up_flag` column on `prospects` | Create |
| `src/lib/types/prospects.ts` | Add `ProspectAppointment`, `ProspectMessage`, `FollowUpFlag` types + label maps | Modify |
| `src/lib/prospects/links.ts` | `buildGoogleCalendarUrl`, `buildMailto`, `buildWhatsappUrl`, date helpers | Create |
| `src/lib/prospects/templates.ts` | Email + WhatsApp template library + `fillTemplate` | Create |
| `src/app/api/prospects/[id]/appointments/route.ts` | `GET` list, `POST` create | Create |
| `src/app/api/prospects/[id]/appointments/[appointmentId]/route.ts` | `PATCH`, `DELETE` | Create |
| `src/app/api/prospects/[id]/messages/route.ts` | `GET` list, `POST` log a sent message (bumps `prossima_data_reminder`) | Create |
| `src/app/api/prospects/[id]/follow-up/route.ts` | `PATCH` `follow_up_flag` | Create |
| `src/components/prospects/appointment-form-modal.tsx` | New/edit appointment modal | Create |
| `src/components/prospects/message-template-modal.tsx` | Template picker → opens mailto/wa.me + logs the send | Create |
| `src/app/(dashboard)/contatti/[id]/page.tsx` | Detail page: info edit + appointments + recent messages | Create |
| `src/app/(dashboard)/contatti/follow-up/page.tsx` | Follow-up worklist with flag + send buttons | Create |
| `src/app/(dashboard)/contatti/page.tsx` | Rows navigate to detail page; remove edit modal; add "Follow-up" link | Modify |
| `CLAUDE.md` | Document Phase 2 | Modify |

**Migration numbering:** Phase 1 used 007. Phase 2 is `008`.

---

## Task 1: Database migration — appointments, messages, follow-up flag

**Files:**
- Create: `supabase/migrations/008_prospect_appointments_messages.sql`

- [ ] **Step 1: Write the migration**

Mirror the style of `supabase/migrations/007_prospects.sql` (transitive RLS via the owning `prospects` row, like `003_customer_dates.sql` does via `customers`).

```sql
-- ============================================
-- Prospect appointments + messages + follow-up flag (Phase 2)
-- Appointments use a client-generated "Add to Calendar" link;
-- google_event_id/google_sync_status are reserved for a future
-- OAuth sync sub-phase (unused in Phase 2).
-- Messages log partner-initiated email/WhatsApp sends (mailto/wa.me).
-- ============================================

CREATE TABLE prospect_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  titolo TEXT NOT NULL,
  data_ora TIMESTAMPTZ NOT NULL,
  durata_min INT NOT NULL DEFAULT 60,
  location TEXT,
  note TEXT,

  -- Reserved for future Google Calendar OAuth sync (unused in Phase 2)
  google_event_id TEXT,
  google_sync_status TEXT CHECK (google_sync_status IN ('synced', 'pending', 'failed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospect_appointments_prospect ON prospect_appointments(prospect_id);
CREATE INDEX idx_prospect_appointments_partner ON prospect_appointments(partner_id);
CREATE INDEX idx_prospect_appointments_data ON prospect_appointments(data_ora);

CREATE TABLE prospect_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  tipo TEXT NOT NULL CHECK (tipo IN ('email', 'whatsapp')),
  template_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospect_messages_prospect ON prospect_messages(prospect_id);
CREATE INDEX idx_prospect_messages_partner ON prospect_messages(partner_id);

-- Follow-up triage flag on the prospect itself (1:1 config)
ALTER TABLE prospects ADD COLUMN follow_up_flag TEXT NOT NULL DEFAULT 'da_valutare'
  CHECK (follow_up_flag IN ('da_valutare', 'inviare', 'non_inviare', 'sospeso'));

ALTER TABLE prospect_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospect_appointments_own" ON prospect_appointments
  FOR ALL TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());

CREATE POLICY "prospect_messages_own" ON prospect_messages
  FOR ALL TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());
```

- [ ] **Step 2: Apply via Supabase SQL editor**

Open https://supabase.com/dashboard/project/ietxuhkkahnvcbchfspt → SQL Editor → paste file contents → Run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('prospect_appointments','prospect_messages');
SELECT column_name FROM information_schema.columns
WHERE table_name = 'prospects' AND column_name = 'follow_up_flag';
```
Expected: both tables listed; `follow_up_flag` row returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/008_prospect_appointments_messages.sql
git commit -m "feat(prospects): migration 008 — appointments, messages, follow-up flag"
```

---

## Task 2: Extend types

**Files:**
- Modify: `src/lib/types/prospects.ts`

- [ ] **Step 1: Append the new types and label maps at the end of the file**

```typescript
export type FollowUpFlag = "da_valutare" | "inviare" | "non_inviare" | "sospeso";

export interface ProspectAppointment {
  id: string;
  prospect_id: string;
  partner_id: string;
  titolo: string;
  data_ora: string;
  durata_min: number;
  location: string | null;
  note: string | null;
  google_event_id: string | null;
  google_sync_status: "synced" | "pending" | "failed" | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectMessage {
  id: string;
  prospect_id: string;
  partner_id: string;
  tipo: "email" | "whatsapp";
  template_id: string | null;
  created_at: string;
}

export const FOLLOW_UP_FLAG_LABELS: Record<FollowUpFlag, string> = {
  da_valutare: "Da valutare",
  inviare: "Inviare",
  non_inviare: "Non inviare",
  sospeso: "Sospeso",
};
```

- [ ] **Step 2: Add `follow_up_flag` to the `Prospect` interface**

In the existing `Prospect` interface, add this line after `cadenza_giorni: number;`:
```typescript
  follow_up_flag: FollowUpFlag;
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/prospects.ts
git commit -m "feat(prospects): add appointment/message/follow-up-flag types"
```

---

## Task 3: Link builders

**Files:**
- Create: `src/lib/prospects/links.ts`

- [ ] **Step 1: Write the link helpers**

These are pure functions (no DOM, no fetch). The `wa.me` cleaning mirrors the existing pattern in `clienti/page.tsx`. `mailto`/`wa.me` use `encodeURIComponent` (yields `%20` for spaces — safe across clients).

```typescript
// Prefilled native-app link builders for prospect actions.
// No OAuth, no backend — these open the partner's own Calendar/Mail/WhatsApp.

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

// Google Calendar TEMPLATE urls want UTC basic format: YYYYMMDDTHHMMSSZ
function toGCalUtc(iso: string): string {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

export function buildGoogleCalendarUrl(appt: {
  titolo: string;
  data_ora: string;
  durata_min: number;
  location?: string | null;
  note?: string | null;
}): string {
  const start = new Date(appt.data_ora);
  const end = new Date(start.getTime() + (appt.durata_min || 60) * 60000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: appt.titolo,
    dates: `${toGCalUtc(appt.data_ora)}/${toGCalUtc(end.toISOString())}`,
  });
  if (appt.note) params.set("details", appt.note);
  if (appt.location) params.set("location", appt.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildMailto(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

export function buildWhatsappUrl(phone: string, text: string): string {
  const clean = phone.replace(/\s+/g, "").replace(/^\+/, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/prospects/links.ts
git commit -m "feat(prospects): add calendar/mailto/whatsapp link builders"
```

---

## Task 4: Message templates library

**Files:**
- Create: `src/lib/prospects/templates.ts`

- [ ] **Step 1: Write the template library**

Templates use a single `{nome}` placeholder (prospect first name). The partner edits the rest before sending. Email templates have subject + body; WhatsApp templates have body only.

```typescript
// Static message templates for prospect follow-up.
// {nome} is replaced with the prospect's first name.

export interface EmailTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

export interface WhatsappTemplate {
  id: string;
  label: string;
  body: string;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "primo_contatto",
    label: "Primo contatto",
    subject: "Piacere di conoscerti, {nome}",
    body:
      "Ciao {nome},\n\nè stato un piacere parlare con te. Come promesso ti scrivo per " +
      "restare in contatto e mandarti qualche informazione in più.\n\n" +
      "Fammi sapere quando hai qualche minuto per sentirci.\n\nUn caro saluto",
  },
  {
    id: "follow_up_settimana",
    label: "Follow-up settimana 1",
    subject: "Come va, {nome}?",
    body:
      "Ciao {nome},\n\nvolevo solo sapere come stai e se hai avuto modo di pensare " +
      "a quello di cui abbiamo parlato.\n\nSono qui per qualsiasi domanda.\n\nA presto",
  },
  {
    id: "follow_up_mese",
    label: "Follow-up mese 1",
    subject: "Un pensiero per te, {nome}",
    body:
      "Ciao {nome},\n\nè passato un po' di tempo e mi è venuto in mente di scriverti. " +
      "Se il momento è giusto, mi farebbe piacere riprendere il discorso.\n\nUn abbraccio",
  },
  {
    id: "opportunita",
    label: "Opportunità",
    subject: "Un'opportunità che potrebbe interessarti, {nome}",
    body:
      "Ciao {nome},\n\nho pensato a te per un'opportunità che secondo me " +
      "potrebbe fare al caso tuo. Ti va se ne parliamo con calma?\n\nDimmi tu quando.",
  },
];

export const WHATSAPP_TEMPLATES: WhatsappTemplate[] = [
  {
    id: "primo_contatto",
    label: "Primo contatto",
    body:
      "Ciao {nome}! È stato un piacere conoscerti 😊 Come promesso ti scrivo per " +
      "restare in contatto. Fammi sapere quando possiamo sentirci!",
  },
  {
    id: "follow_up_settimana",
    label: "Follow-up settimana 1",
    body:
      "Ciao {nome}! Come stai? Volevo sapere se hai avuto modo di pensare a " +
      "quello di cui abbiamo parlato 🙂",
  },
  {
    id: "follow_up_mese",
    label: "Follow-up mese 1",
    body:
      "Ciao {nome}! È passato un po' di tempo, mi è venuto in mente di scriverti. " +
      "Se ti va riprendiamo il discorso quando vuoi 👍",
  },
  {
    id: "opportunita",
    label: "Opportunità",
    body:
      "Ciao {nome}! Ho pensato a te per un'opportunità che credo possa interessarti. " +
      "Ti va se ne parliamo? 🚀",
  },
];

export function fillTemplate(text: string, nome: string): string {
  const firstName = nome.trim().split(/\s+/)[0] || nome;
  return text.replaceAll("{nome}", firstName);
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors. (`replaceAll` requires the project's TS lib target to include ES2021; if `tsc` errors on `replaceAll`, replace with `text.split("{nome}").join(firstName)`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/prospects/templates.ts
git commit -m "feat(prospects): add email/whatsapp follow-up templates"
```

---

## Task 5: Appointments API — list + create

**Files:**
- Create: `src/app/api/prospects/[id]/appointments/route.ts`

Auth + ownership pattern mirrors `src/app/api/customers/[id]/dates/route.ts` / Phase 1 routes. The prospect ownership is enforced by inserting `partner_id = user.id` and the RLS policy; we also verify the parent prospect belongs to the user before listing/creating.

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function ownsProspect(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prospectId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("prospects")
    .select("id")
    .eq("id", prospectId)
    .eq("partner_id", userId)
    .single();
  return !!data;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("prospect_appointments")
    .select("*")
    .eq("prospect_id", id)
    .eq("partner_id", user.id)
    .order("data_ora", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appointments: data || [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  if (!(await ownsProspect(supabase, id, user.id))) {
    return NextResponse.json({ error: "Contatto non trovato" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { titolo, data_ora, durata_min, location, note } = body;

    if (!data_ora) {
      return NextResponse.json(
        { error: "Data e ora sono obbligatorie" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("prospect_appointments")
      .insert({
        prospect_id: id,
        partner_id: user.id,
        titolo: titolo?.trim() || "Appuntamento",
        data_ora,
        durata_min: typeof durata_min === "number" ? durata_min : 60,
        location: location?.trim() || null,
        note: note?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ appointment: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors in new files.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/prospects/[id]/appointments/route.ts"
git commit -m "feat(prospects): appointments list + create API"
```

---

## Task 6: Appointments API — update + delete

**Files:**
- Create: `src/app/api/prospects/[id]/appointments/[appointmentId]/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EDITABLE = ["titolo", "data_ora", "durata_min", "location", "note"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; appointmentId: string }> }
) {
  const supabase = await createClient();
  const { appointmentId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE) {
      if (field in body) {
        const value = body[field];
        updates[field] =
          typeof value === "string" ? value.trim() || null : value;
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Nessun campo da aggiornare" },
        { status: 400 }
      );
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("prospect_appointments")
      .update(updates)
      .eq("id", appointmentId)
      .eq("partner_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ appointment: data });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; appointmentId: string }> }
) {
  const supabase = await createClient();
  const { appointmentId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { error } = await supabase
    .from("prospect_appointments")
    .delete()
    .eq("id", appointmentId)
    .eq("partner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors in new files.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/prospects/[id]/appointments/[appointmentId]/route.ts"
git commit -m "feat(prospects): appointment update + delete API"
```

---

## Task 7: Messages API — list + log send (bumps reminder)

**Files:**
- Create: `src/app/api/prospects/[id]/messages/route.ts`

Logging a send also advances the prospect's `prossima_data_reminder` by `cadenza_giorni` so the follow-up worklist reschedules automatically.

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("prospect_messages")
    .select("*")
    .eq("prospect_id", id)
    .eq("partner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: data || [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // Verify ownership + read cadence in one fetch
  const { data: prospect } = await supabase
    .from("prospects")
    .select("id, cadenza_giorni")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (!prospect) {
    return NextResponse.json({ error: "Contatto non trovato" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { tipo, template_id } = body;

    if (tipo !== "email" && tipo !== "whatsapp") {
      return NextResponse.json({ error: "Tipo non valido" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("prospect_messages")
      .insert({
        prospect_id: id,
        partner_id: user.id,
        tipo,
        template_id: template_id || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Advance the next reminder by the cadence
    const next = new Date();
    next.setDate(next.getDate() + (prospect.cadenza_giorni || 14));
    await supabase
      .from("prospects")
      .update({ prossima_data_reminder: next.toISOString().slice(0, 10) })
      .eq("id", id)
      .eq("partner_id", user.id);

    return NextResponse.json({ message: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors in new files.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/prospects/[id]/messages/route.ts"
git commit -m "feat(prospects): messages log API (bumps next reminder by cadence)"
```

---

## Task 8: Follow-up flag API

**Files:**
- Create: `src/app/api/prospects/[id]/follow-up/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const FLAGS = ["da_valutare", "inviare", "non_inviare", "sospeso"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { follow_up_flag } = body;

    if (!FLAGS.includes(follow_up_flag)) {
      return NextResponse.json({ error: "Flag non valido" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("prospects")
      .update({ follow_up_flag, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("partner_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ prospect: data });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors in new files.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/prospects/[id]/follow-up/route.ts"
git commit -m "feat(prospects): follow-up flag PATCH API"
```

---

## Task 9: Appointment form modal component

**Files:**
- Create: `src/components/prospects/appointment-form-modal.tsx`

A controlled modal for creating/editing an appointment. The parent passes `prospectId`, optional `appointment` (edit mode), `defaultTitolo`, and `onSaved`/`onClose` callbacks. Uses the same modal chrome as the Phase 1 edit modal.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import type { ProspectAppointment } from "@/lib/types/prospects";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// Format an ISO timestamp to the value a datetime-local input expects.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

type Props = {
  prospectId: string;
  appointment?: ProspectAppointment | null;
  defaultTitolo: string;
  onSaved: () => void;
  onClose: () => void;
};

export function AppointmentFormModal({
  prospectId,
  appointment,
  defaultTitolo,
  onSaved,
  onClose,
}: Props) {
  const isEdit = !!appointment;
  const [form, setForm] = useState({
    titolo: appointment?.titolo || defaultTitolo,
    data_ora: appointment ? toLocalInput(appointment.data_ora) : "",
    durata_min: appointment?.durata_min ?? 60,
    location: appointment?.location || "",
    note: appointment?.note || "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.data_ora) return;
    setSaving(true);
    const payload = {
      titolo: form.titolo,
      data_ora: new Date(form.data_ora).toISOString(),
      durata_min: form.durata_min,
      location: form.location,
      note: form.note,
    };
    const url = isEdit
      ? `/api/prospects/${prospectId}/appointments/${appointment!.id}`
      : `/api/prospects/${prospectId}/appointments`;
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      onSaved();
      onClose();
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!appointment) return;
    setDeleting(true);
    const res = await fetch(
      `/api/prospects/${prospectId}/appointments/${appointment.id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      onSaved();
      onClose();
    }
    setDeleting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md shadow-xl mb-8">
        <div className="flex items-center justify-between p-5 border-b border-divider">
          <h3 className="text-lg font-bold text-text-primary">
            {isEdit ? "Modifica appuntamento" : "Nuovo appuntamento"}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Titolo</label>
            <input type="text" value={form.titolo} onChange={(e) => setForm({ ...form, titolo: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Data e ora *</label>
              <input type="datetime-local" required value={form.data_ora} onChange={(e) => setForm({ ...form, data_ora: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Durata (min)</label>
              <input type="number" min={15} step={15} value={form.durata_min} onChange={(e) => setForm({ ...form, durata_min: parseInt(e.target.value) || 60 })} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Luogo</label>
            <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="es. Bar Centrale, Zoom..." className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Note</label>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className={`${inputClass} resize-none`} />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-divider">
            <div>
              {isEdit && (
                <button type="button" onClick={handleDelete} disabled={deleting} className="text-sm text-coral font-medium hover:opacity-70 transition-opacity disabled:opacity-50">
                  {deleting ? "..." : "Elimina"}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:bg-bg-section transition-all">Annulla</button>
              <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
                {saving ? "..." : "Salva"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors in new files.

- [ ] **Step 3: Commit**

```bash
git add src/components/prospects/appointment-form-modal.tsx
git commit -m "feat(prospects): appointment form modal component"
```

---

## Task 10: Message template modal component

**Files:**
- Create: `src/components/prospects/message-template-modal.tsx`

Lets the partner pick a template, edit the text, then open the prefilled `mailto:`/`wa.me` link in a new tab and log the send. The same component serves both email and WhatsApp (controlled by the `tipo` prop).

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import {
  EMAIL_TEMPLATES,
  WHATSAPP_TEMPLATES,
  fillTemplate,
} from "@/lib/prospects/templates";
import { buildMailto, buildWhatsappUrl } from "@/lib/prospects/links";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

type Props = {
  prospectId: string;
  tipo: "email" | "whatsapp";
  nome: string;
  email: string | null;
  telefono: string | null;
  onSent: () => void;
  onClose: () => void;
};

export function MessageTemplateModal({
  prospectId,
  tipo,
  nome,
  email,
  telefono,
  onSent,
  onClose,
}: Props) {
  const templates = tipo === "email" ? EMAIL_TEMPLATES : WHATSAPP_TEMPLATES;
  const [templateId, setTemplateId] = useState(templates[0].id);
  const selected = templates.find((t) => t.id === templateId) || templates[0];

  const [subject, setSubject] = useState(
    tipo === "email" ? fillTemplate(EMAIL_TEMPLATES[0].subject, nome) : ""
  );
  const [bodyText, setBodyText] = useState(fillTemplate(selected.body, nome));
  const [sending, setSending] = useState(false);

  function selectTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setBodyText(fillTemplate(t.body, nome));
    if (tipo === "email" && "subject" in t) {
      setSubject(fillTemplate((t as { subject: string }).subject, nome));
    }
  }

  const missingTarget =
    tipo === "email" ? !email : !telefono;

  async function handleSend() {
    setSending(true);
    // Open the prefilled native-app link
    const url =
      tipo === "email"
        ? buildMailto(email || "", subject, bodyText)
        : buildWhatsappUrl(telefono || "", bodyText);
    window.open(url, "_blank");

    // Log the send (also advances the next reminder)
    await fetch(`/api/prospects/${prospectId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, template_id: templateId }),
    });
    setSending(false);
    onSent();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-lg shadow-xl mb-8">
        <div className="flex items-center justify-between p-5 border-b border-divider">
          <h3 className="text-lg font-bold text-text-primary">
            {tipo === "email" ? "Email a " : "WhatsApp a "} {nome}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Template</label>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTemplate(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    templateId === t.id
                      ? "bg-accent text-white"
                      : "bg-bg-section text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {tipo === "email" && (
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Oggetto</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Messaggio</label>
            <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={8} className={`${inputClass} resize-none`} />
          </div>

          {missingTarget && (
            <p className="text-xs text-coral">
              {tipo === "email"
                ? "Questo contatto non ha un'email."
                : "Questo contatto non ha un numero di telefono."}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-divider">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:bg-bg-section transition-all">Annulla</button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || missingTarget}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
            >
              {sending ? "..." : tipo === "email" ? "Apri email" : "Apri WhatsApp"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors in new files.

- [ ] **Step 3: Commit**

```bash
git add src/components/prospects/message-template-modal.tsx
git commit -m "feat(prospects): message template modal (mailto/wa.me + log)"
```

---

## Task 11: Detail page `/contatti/[id]`

**Files:**
- Create: `src/app/(dashboard)/contatti/[id]/page.tsx`

The detail page becomes the single edit surface for a prospect: editable info + pipeline state + follow-up sub-tag (moved from the Phase 1 list modal), plus appointments and recent messages. Layout mirrors `ordini-clienti/[id]/page.tsx` (back nav, fetch by id, section cards). Two-column on desktop, stacked on mobile.

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  type Prospect,
  type ProspectStato,
  type ProspectAppointment,
  type ProspectMessage,
  SOURCE_LABELS,
  STATO_LABELS,
  STATO_BADGE,
  SUB_TAG_LABELS,
} from "@/lib/types/prospects";
import { buildGoogleCalendarUrl } from "@/lib/prospects/links";
import { AppointmentFormModal } from "@/components/prospects/appointment-form-modal";
import { MessageTemplateModal } from "@/components/prospects/message-template-modal";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export default function ContattoDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [appointments, setAppointments] = useState<ProspectAppointment[]>([]);
  const [messages, setMessages] = useState<ProspectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    nome: "",
    telefono: "",
    email: "",
    citta: "",
    source: "contatto_personale" as string,
    note: "",
    stato: "nuovo_contatto" as ProspectStato,
    sub_tag_follow_up: "" as string,
    sub_tag_custom: "",
    cadenza_giorni: 14,
    prossima_data_reminder: "",
  });

  const [showApptForm, setShowApptForm] = useState(false);
  const [editAppt, setEditAppt] = useState<ProspectAppointment | null>(null);
  const [msgModal, setMsgModal] = useState<"email" | "whatsapp" | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/prospects/${id}`);
    if (!res.ok) {
      setError("Contatto non trovato");
      setLoading(false);
      return;
    }
    const data = await res.json();
    const p: Prospect = data.prospect;
    setProspect(p);
    setForm({
      nome: p.nome,
      telefono: p.telefono || "",
      email: p.email || "",
      citta: p.citta || "",
      source: p.source,
      note: p.note || "",
      stato: p.stato,
      sub_tag_follow_up: p.sub_tag_follow_up || "",
      sub_tag_custom: p.sub_tag_custom || "",
      cadenza_giorni: p.cadenza_giorni,
      prossima_data_reminder: p.prossima_data_reminder || "",
    });
    const [aRes, mRes] = await Promise.all([
      fetch(`/api/prospects/${id}/appointments`),
      fetch(`/api/prospects/${id}/messages`),
    ]);
    setAppointments((await aRes.json()).appointments || []);
    setMessages((await mRes.json()).messages || []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleSave() {
    if (!prospect || !form.nome.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      sub_tag_follow_up:
        form.stato === "follow_up" ? form.sub_tag_follow_up || null : null,
      sub_tag_custom:
        form.stato === "follow_up" && form.sub_tag_follow_up === "custom"
          ? form.sub_tag_custom
          : null,
      prossima_data_reminder: form.prossima_data_reminder || null,
    };
    const res = await fetch(`/api/prospects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) await fetchAll();
    setSaving(false);
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !prospect) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary text-sm mb-4">{error || "Errore"}</p>
        <button onClick={() => router.push("/contatti")} className="text-accent font-semibold text-sm">
          ← Torna ai contatti
        </button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => router.push("/contatti")} className="text-sm text-text-secondary hover:text-text-primary mb-4 transition-colors">
        ← Contatti
      </button>

      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white text-base font-bold shrink-0">
            {prospect.nome.trim().slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{prospect.nome}</h2>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-xs font-semibold ${STATO_BADGE[prospect.stato]}`}>
              {STATO_LABELS[prospect.stato]}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        {/* LEFT: editable info */}
        <div className="bg-bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary">Dati e pipeline</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Nome *</label>
              <input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Telefono</label>
              <input type="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Città</label>
              <input type="text" value={form.citta} onChange={(e) => setForm({ ...form, citta: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Provenienza</label>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={inputClass}>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Stato pipeline</label>
              <select value={form.stato} onChange={(e) => setForm({ ...form, stato: e.target.value as ProspectStato })} className={inputClass}>
                {Object.entries(STATO_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </div>
          </div>

          {form.stato === "follow_up" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-divider pt-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">Motivo follow-up</label>
                <select value={form.sub_tag_follow_up} onChange={(e) => setForm({ ...form, sub_tag_follow_up: e.target.value })} className={inputClass}>
                  <option value="">— seleziona —</option>
                  {Object.entries(SUB_TAG_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                </select>
              </div>
              {form.sub_tag_follow_up === "custom" && (
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Specifica</label>
                  <input type="text" value={form.sub_tag_custom} onChange={(e) => setForm({ ...form, sub_tag_custom: e.target.value })} className={inputClass} />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">Cadenza (giorni)</label>
                <input type="number" min={1} value={form.cadenza_giorni} onChange={(e) => setForm({ ...form, cadenza_giorni: parseInt(e.target.value) || 14 })} className={inputClass} />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Prossima azione (data)</label>
            <input type="date" value={form.prossima_data_reminder} onChange={(e) => setForm({ ...form, prossima_data_reminder: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Note</label>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className={`${inputClass} resize-none`} />
          </div>

          {/* Quick message actions */}
          <div className="flex gap-2 border-t border-divider pt-4">
            <button type="button" onClick={() => setMsgModal("email")} className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all">✉️ Email</button>
            <button type="button" onClick={() => setMsgModal("whatsapp")} className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold bg-[#25D366] text-white hover:opacity-90 transition-all">WhatsApp</button>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
              {saving ? "Salvataggio..." : "Salva modifiche"}
            </button>
          </div>
        </div>

        {/* RIGHT: appointments + messages */}
        <div className="space-y-6">
          <div className="bg-bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary">Appuntamenti</h3>
              <button type="button" onClick={() => { setEditAppt(null); setShowApptForm(true); }} className="text-sm font-semibold text-accent hover:opacity-70 transition-opacity">+ Nuovo</button>
            </div>
            {appointments.length === 0 ? (
              <p className="text-sm text-text-secondary py-2">Nessun appuntamento.</p>
            ) : (
              <div className="space-y-2">
                {appointments.map((a) => (
                  <div key={a.id} className="p-3 bg-bg-main rounded-xl border-l-4 border-accent">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-text-primary">{a.titolo}</p>
                        <p className="text-xs text-text-secondary">{formatDateTime(a.data_ora)}{a.location ? ` · ${a.location}` : ""}</p>
                      </div>
                      <button type="button" onClick={() => { setEditAppt(a); setShowApptForm(true); }} className="text-xs text-text-secondary hover:text-accent shrink-0">Modifica</button>
                    </div>
                    <a href={buildGoogleCalendarUrl(a)} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-xs font-semibold text-accent hover:underline">
                      📅 Aggiungi a Google Calendar
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-bg-card border border-border rounded-2xl p-5">
            <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary mb-3">Contatti recenti</h3>
            {messages.length === 0 ? (
              <p className="text-sm text-text-secondary py-2">Nessun messaggio inviato.</p>
            ) : (
              <div className="space-y-2">
                {messages.slice(0, 8).map((m) => (
                  <div key={m.id} className="flex items-center gap-3 text-sm">
                    <span className="text-text-gentle">{m.tipo === "email" ? "✉️" : "💬"}</span>
                    <span className="text-text-secondary">{formatDateTime(m.created_at)}</span>
                    {m.template_id && <span className="text-xs text-text-gentle">· {m.template_id}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showApptForm && (
        <AppointmentFormModal
          prospectId={id}
          appointment={editAppt}
          defaultTitolo={`Appuntamento con ${prospect.nome}`}
          onSaved={fetchAll}
          onClose={() => setShowApptForm(false)}
        />
      )}

      {msgModal && (
        <MessageTemplateModal
          prospectId={id}
          tipo={msgModal}
          nome={prospect.nome}
          email={prospect.email}
          telefono={prospect.telefono}
          onSent={fetchAll}
          onClose={() => setMsgModal(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors in new files; `/contatti/[id]` appears in the route manifest.

- [ ] **Step 3: Manual check (preview)**

Navigate to a prospect's detail page (you'll wire the row link in Task 13; for now visit `/contatti/<id>` directly using an id from the DB). Confirm: info edits save; adding an appointment shows it with a working "Aggiungi a Google Calendar" link; clicking Email/WhatsApp opens the template modal, and "Apri email"/"Apri WhatsApp" opens the prefilled link and logs an entry under "Contatti recenti".

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/contatti/[id]/page.tsx"
git commit -m "feat(prospects): detail page with appointments + messaging"
```

---

## Task 12: Follow-up worklist `/contatti/follow-up`

**Files:**
- Create: `src/app/(dashboard)/contatti/follow-up/page.tsx`

Lists prospects with `stato = 'follow_up'`, each with an inline flag selector (Da valutare / Inviare / Non inviare / Sospeso) and Email/WhatsApp send buttons. Reuses `MessageTemplateModal`.

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  type Prospect,
  type FollowUpFlag,
  SUB_TAG_LABELS,
  FOLLOW_UP_FLAG_LABELS,
} from "@/lib/types/prospects";
import { MessageTemplateModal } from "@/components/prospects/message-template-modal";

const FLAGS: FollowUpFlag[] = ["da_valutare", "inviare", "non_inviare", "sospeso"];

export default function FollowUpPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgTarget, setMsgTarget] = useState<{ p: Prospect; tipo: "email" | "whatsapp" } | null>(null);

  const fetchFollowUps = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/prospects?stato=follow_up");
    const data = await res.json();
    setProspects(data.prospects || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFollowUps();
  }, [fetchFollowUps]);

  async function setFlag(p: Prospect, flag: FollowUpFlag) {
    setProspects((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, follow_up_flag: flag } : x))
    );
    await fetch(`/api/prospects/${p.id}/follow-up`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ follow_up_flag: flag }),
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Follow-up</h2>
        <p className="text-text-secondary text-sm mt-1">
          {prospects.length} contatti da mantenere
        </p>
      </div>

      {prospects.length === 0 ? (
        <div className="text-center py-12 text-text-secondary text-sm">
          Nessun contatto in follow-up. Imposta lo stato &quot;Follow-up&quot; su un contatto per vederlo qui.
        </div>
      ) : (
        <div className="space-y-3">
          {prospects.map((p) => (
            <div key={p.id} className="bg-bg-card border border-border rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-text-primary">{p.nome}</div>
                <div className="text-xs text-text-secondary flex flex-wrap gap-x-3">
                  {p.sub_tag_follow_up && (
                    <span>{p.sub_tag_follow_up === "custom" ? p.sub_tag_custom : SUB_TAG_LABELS[p.sub_tag_follow_up]}</span>
                  )}
                  {p.prossima_data_reminder && (
                    <span>Prossima: {new Date(p.prossima_data_reminder).toLocaleDateString("it-IT")}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {FLAGS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFlag(p, f)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      p.follow_up_flag === f
                        ? "bg-accent text-white"
                        : "bg-bg-section text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {FOLLOW_UP_FLAG_LABELS[f]}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 shrink-0">
                <button onClick={() => setMsgTarget({ p, tipo: "email" })} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all">Email</button>
                <button onClick={() => setMsgTarget({ p, tipo: "whatsapp" })} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#25D366] text-white hover:opacity-90 transition-all">WhatsApp</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {msgTarget && (
        <MessageTemplateModal
          prospectId={msgTarget.p.id}
          tipo={msgTarget.tipo}
          nome={msgTarget.p.nome}
          email={msgTarget.p.email}
          telefono={msgTarget.p.telefono}
          onSent={fetchFollowUps}
          onClose={() => setMsgTarget(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors; `/contatti/follow-up` in the route manifest.

- [ ] **Step 3: Manual check (preview)**

Set a prospect's stato to "Follow-up" (on its detail page), then visit `/contatti/follow-up`. Confirm it appears; changing the flag persists on reload; Email/WhatsApp open the template modal.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/contatti/follow-up/page.tsx"
git commit -m "feat(prospects): follow-up worklist with triage flag"
```

---

## Task 13: Wire list → detail page; remove Phase 1 edit modal; add follow-up link

**Files:**
- Modify: `src/app/(dashboard)/contatti/page.tsx`

The detail page is now the edit surface, so the Phase 1 list modal is removed and rows navigate to `/contatti/[id]`. A "Follow-up" link is added next to the page header.

- [ ] **Step 1: Add the router import**

At the top of the file, after `import { useEffect, useState } from "react";`, add:
```tsx
import { useRouter } from "next/navigation";
```

- [ ] **Step 2: Remove edit-modal state and handlers**

Delete the entire "Edit modal state" block (the `editProspect`, `editForm`, `editSaving`, `confirmDelete`, `deleting` `useState` declarations) and the `openEdit`, `closeEdit`, `handleUpdate`, `handleDelete` functions.

- [ ] **Step 3: Add the router and a navigate helper**

Inside the component, after `const [formData, setFormData] = useState(...)`, add:
```tsx
  const router = useRouter();
```

- [ ] **Step 4: Change row/card click to navigate**

In the desktop table, change the `<tr>` handler:
```tsx
              <tr
                key={p.id}
                onClick={() => router.push(`/contatti/${p.id}`)}
                className="border-b border-divider last:border-0 hover:bg-bg-section/50 transition-colors cursor-pointer"
              >
```
In the mobile cards, change the `<button>` handler:
```tsx
          <button
            key={p.id}
            onClick={() => router.push(`/contatti/${p.id}`)}
            className="w-full text-left bg-bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:shadow-md hover:border-accent/30 transition-all"
          >
```

- [ ] **Step 5: Delete the edit-modal JSX**

Remove the entire `{editProspect && ( ... )}` block at the bottom of the component (the modal markup).

- [ ] **Step 6: Update the import to drop now-unused symbols**

The list page no longer uses `SUB_TAG_LABELS` (it moved to the detail page). Change the import to:
```tsx
import {
  type Prospect,
  type ProspectStato,
  SOURCE_LABELS,
  STATO_LABELS,
  STATO_BADGE,
} from "@/lib/types/prospects";
```

- [ ] **Step 7: Add a "Follow-up" link in the header**

Change the header action area (the `<button>` for "+ Nuovo Contatto") to sit next to a Follow-up link:
```tsx
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/contatti/follow-up")}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all"
          >
            Follow-up
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
          >
            {showForm ? "Annulla" : "+ Nuovo Contatto"}
          </button>
        </div>
```
(Replace the single existing "+ Nuovo Contatto" button with this wrapped pair.)

- [ ] **Step 8: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors; no unused-variable lint errors (confirms all modal code/imports were removed cleanly).

- [ ] **Step 9: Manual check (preview)**

On `/contatti`: clicking a row navigates to the detail page (no modal). The "Follow-up" header button opens the worklist. Creating a contact still works via "+ Nuovo Contatto".

- [ ] **Step 10: Commit**

```bash
git add "src/app/(dashboard)/contatti/page.tsx"
git commit -m "refactor(prospects): list rows open detail page; remove edit modal; add follow-up link"
```

---

## Task 14: Docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Expand the Contatti/Prospect feature block**

Replace the Phase 1 "**Phase 1 only**" bullet in the "Contatti / Prospect (pipeline lead)" section with:

```markdown
- **Detail page** `/contatti/[id]`: edit info/pipeline + appuntamenti + messaggi recenti
- **Appuntamenti** (`prospect_appointments`): titolo, data/ora, durata, luogo, note + link "Aggiungi a Google Calendar" (URL prefillato, no OAuth — colonne `google_event_id`/`google_sync_status` riservate per sync futura)
- **Messaggi follow-up**: template email/WhatsApp prefillati via `mailto:`/`wa.me` (no invio automatico), loggati in `prospect_messages`; ogni invio sposta `prossima_data_reminder` di `cadenza_giorni`
- **Follow-up worklist** `/contatti/follow-up`: flag triage (da_valutare/inviare/non_inviare/sospeso) + bottoni invio
- **Phase 3 (da fare)**: conversione cliente/partner + analytics (vedi `docs/superpowers/specs/2026-06-20-prospects-design.md`)
```

- [ ] **Step 2: Update the migrations line**

Append `, 008_prospect_appointments_messages.sql` to the "Migration applicate" line.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): document Contatti/Prospect Phase 2"
```

---

## Self-Review

**Spec coverage (Phase 2 rows of the spec):**
- Appointment scheduling (date/time + notes) → Tasks 1, 5, 6, 9, 11 ✓
- Google Calendar integration → delivered as prefilled "Add to Calendar" link (Task 3 `buildGoogleCalendarUrl`, Task 11 link); OAuth columns reserved (Task 1). **Deviation from spec's OAuth, per 2026-06-20 user decision — documented in Architecture + Task 14.** ✓
- Email templates → Task 4; delivered via `mailto:` (Task 3, Task 10). **Deviation from spec's Resend auto-send, per 2026-06-20 user decision.** ✓
- WhatsApp templates (wa.me) → Tasks 3, 4, 10 ✓
- Follow-up list with send/don't-send/suspended flag → Tasks 8, 12 ✓
- Cadence reminder (default 14d, customizable) → Phase 1 columns; bumped on send (Task 7); editable on detail page (Task 11) ✓
- Message composition (template selector + custom text) → Task 10 ✓
- Tracking (last sent / next reminder) → `prospect_messages` (Task 1, 7) + `prossima_data_reminder` bump (Task 7) ✓

**Placeholder scan:** No TBD/TODO. Every code step shows complete code. Manual checks give concrete navigation/click sequences. ✓

**Type consistency:** `ProspectAppointment`, `ProspectMessage`, `FollowUpFlag`, `FOLLOW_UP_FLAG_LABELS` defined in Task 2 and consumed with identical names in Tasks 9–13. API editable whitelists (Tasks 6, 8) match the fields written by the modals (Tasks 9, 12). `buildGoogleCalendarUrl`/`buildMailto`/`buildWhatsappUrl` signatures (Task 3) match call sites (Tasks 10, 11). `fillTemplate`/`EMAIL_TEMPLATES`/`WHATSAPP_TEMPLATES` (Task 4) match usage (Task 10). Migration column names (Task 1) match the interfaces (Task 2). ✓

**Cross-cutting checks:**
- Removing the Phase 1 edit modal (Task 13) — its full edit capability is reproduced on the detail page (Task 11), so no functionality is lost. ✓
- `mailto:` body newlines: templates use `\n`; `encodeURIComponent` (Task 3) encodes them as `%0A`, which mail clients render as line breaks. ✓
- Ownership: every appointment/message insert sets `partner_id = user.id` and RLS enforces `partner_id = auth.uid()`; create handlers additionally verify the parent prospect belongs to the user (Tasks 5, 7). ✓
- External setup required: **none.** Only the migration (Task 1) must be applied to Supabase, and (as in Phase 1) commits are local until the user pushes. ✓
