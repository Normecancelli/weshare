# Prospect Management — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the prospect/lead pipeline core — CRUD prospects with source, pipeline state, follow-up sub-tags, and a next-action reminder date — at route `/contatti`, isolated per partner.

**Architecture:** Follows the existing `customers` module verbatim: one Supabase table with RLS `partner_id = auth.uid()`, Next.js App Router API routes under `src/app/api/prospects/`, a client page at `src/app/(dashboard)/contatti/page.tsx` with desktop table + mobile cards, and shared TypeScript types in `src/lib/types/prospects.ts`.

**Tech Stack:** Next.js 16 (App Router, TS), Supabase (Postgres + RLS), Tailwind v4, lucide-react icons.

**Verification note:** This project has **no test framework installed** (no jest/vitest, no `test` script in `package.json`). Do NOT add one — it's out of scope. Each task is verified with `npm run lint`, `npm run build`, and manual checks against the running dev server (`npm run dev`). Treat a clean build + lint + the stated manual check as the "tests pass" gate.

**Scope boundary:** Phase 1 only. NO appointments, NO Google Calendar, NO email/WhatsApp sending, NO conversion to customer/partner, NO analytics. Those are Phases 2–3 (separate plans). The DB migration in Task 1 creates the full `prospects` table (including conversion columns) so later phases need no schema change, but Phase 1 code touches only the Phase 1 columns.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `supabase/migrations/007_prospects.sql` | `prospects` table + indexes + RLS | Create |
| `src/lib/types/prospects.ts` | `Prospect`, `ProspectSource`, `ProspectStato`, `ProspectSubTag` types + label maps | Create |
| `src/app/api/prospects/route.ts` | `GET` (list + filter by stato/search), `POST` (create) | Create |
| `src/app/api/prospects/[id]/route.ts` | `GET` one, `PATCH` update, `DELETE` | Create |
| `src/app/(dashboard)/contatti/page.tsx` | List page: desktop table, mobile cards, create/edit modal | Create |
| `src/components/sidebar.tsx` | Remove dead `/prospect` nav item; keep `/contatti` | Modify |

**Migration numbering rationale:** present files are `002`–`004`; `005` is applied-but-absent and `006` is reserved (events/settings) per `CLAUDE.md`. `007` avoids both collisions.

---

## Task 1: Database migration — `prospects` table

**Files:**
- Create: `supabase/migrations/007_prospects.sql`

- [ ] **Step 1: Write the migration file**

Mirror the style of `supabase/migrations/003_customer_dates.sql` (table + indexes + `ENABLE ROW LEVEL SECURITY` + one `FOR ALL TO authenticated` policy).

```sql
-- ============================================
-- Prospects (pipeline contatti/lead)
-- Phase 1: core CRUD. Conversion + follow-up messaging columns
-- are created now so Phases 2-3 need no schema change.
-- ============================================

CREATE TABLE prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Contact data
  nome TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  citta TEXT,
  source TEXT NOT NULL DEFAULT 'altro'
    CHECK (source IN ('contatto_personale', 'lista', 'social', 'referenza', 'altro')),
  note TEXT,

  -- Pipeline state
  stato TEXT NOT NULL DEFAULT 'nuovo_contatto'
    CHECK (stato IN ('nuovo_contatto', 'primo_appt', 'secondo_appt',
                     'convertito_cliente', 'convertito_partner', 'follow_up')),

  -- Follow-up categorization (only when stato = 'follow_up')
  sub_tag_follow_up TEXT
    CHECK (sub_tag_follow_up IN ('interessato_non_ora', 'necessita_info', 'ha_detto_no', 'custom')),
  sub_tag_custom TEXT,

  -- Follow-up cadence + next action reminder
  cadenza_giorni INT NOT NULL DEFAULT 14,
  prossima_data_reminder DATE,

  -- Conversion tracking (Phase 3 — columns reserved, unused in Phase 1)
  convertito_a TEXT CHECK (convertito_a IN ('cliente', 'partner')),
  customer_id UUID REFERENCES customers(id),
  profile_id_nuovo_partner UUID REFERENCES profiles(id),
  data_conversione TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospects_partner ON prospects(partner_id);
CREATE INDEX idx_prospects_stato ON prospects(stato);
CREATE INDEX idx_prospects_prossima_data ON prospects(prossima_data_reminder);

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospects_own" ON prospects
  FOR ALL TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());
```

- [ ] **Step 2: Apply the migration to Supabase**

There is no migration runner in this repo — migrations are applied by hand via the Supabase SQL editor (per `CLAUDE.md`).
Open https://supabase.com/dashboard/project/ietxuhkkahnvcbchfspt → SQL Editor → paste the file contents → Run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify the table exists**

In the Supabase SQL editor run:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'prospects' ORDER BY ordinal_position;
```
Expected: rows listing `id, partner_id, nome, telefono, email, citta, source, note, stato, sub_tag_follow_up, sub_tag_custom, cadenza_giorni, prossima_data_reminder, convertito_a, customer_id, profile_id_nuovo_partner, data_conversione, created_at, updated_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/007_prospects.sql
git commit -m "feat(prospects): add prospects table migration (Phase 1)"
```

---

## Task 2: TypeScript types

**Files:**
- Create: `src/lib/types/prospects.ts`

- [ ] **Step 1: Write the types file**

Mirror the shape style of `src/lib/types/orders.ts`. Include label maps (Italian UI strings) so the page and any future component share one source of truth.

```typescript
// Shared TypeScript types for the prospects (contatti/lead) module

export type ProspectSource =
  | "contatto_personale"
  | "lista"
  | "social"
  | "referenza"
  | "altro";

export type ProspectStato =
  | "nuovo_contatto"
  | "primo_appt"
  | "secondo_appt"
  | "convertito_cliente"
  | "convertito_partner"
  | "follow_up";

export type ProspectSubTag =
  | "interessato_non_ora"
  | "necessita_info"
  | "ha_detto_no"
  | "custom";

export interface Prospect {
  id: string;
  partner_id: string;
  nome: string;
  telefono: string | null;
  email: string | null;
  citta: string | null;
  source: ProspectSource;
  note: string | null;
  stato: ProspectStato;
  sub_tag_follow_up: ProspectSubTag | null;
  sub_tag_custom: string | null;
  cadenza_giorni: number;
  prossima_data_reminder: string | null;
  // Conversion columns (Phase 3 — present in DB, unused in Phase 1 UI)
  convertito_a: "cliente" | "partner" | null;
  customer_id: string | null;
  profile_id_nuovo_partner: string | null;
  data_conversione: string | null;
  created_at: string;
  updated_at: string;
}

export const SOURCE_LABELS: Record<ProspectSource, string> = {
  contatto_personale: "Contatto personale",
  lista: "Lista nomi",
  social: "Social",
  referenza: "Referenza",
  altro: "Altro",
};

export const STATO_LABELS: Record<ProspectStato, string> = {
  nuovo_contatto: "Nuovo contatto",
  primo_appt: "Primo appuntamento",
  secondo_appt: "Secondo appuntamento",
  convertito_cliente: "Convertito a cliente",
  convertito_partner: "Convertito a partner",
  follow_up: "Follow-up",
};

export const SUB_TAG_LABELS: Record<ProspectSubTag, string> = {
  interessato_non_ora: "Interessato ma non ora",
  necessita_info: "Necessita più info",
  ha_detto_no: "Ha detto no",
  custom: "Altro (personalizzato)",
};

// Tailwind badge classes per pipeline state (reuses existing theme tokens)
export const STATO_BADGE: Record<ProspectStato, string> = {
  nuovo_contatto: "bg-bg-section text-text-secondary",
  primo_appt: "bg-accent-glow text-accent",
  secondo_appt: "bg-accent-glow text-accent",
  convertito_cliente: "bg-[#dcfce7] text-[#166534]",
  convertito_partner: "bg-[#ffedd5] text-[#9a3412]",
  follow_up: "bg-[#fef9c3] text-[#854d0e]",
};
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: build succeeds (the file is only imported once compiled by consumers; at minimum it must not contain TS syntax errors). If you want a faster check first, run `npx tsc --noEmit`.
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/prospects.ts
git commit -m "feat(prospects): add shared types and label maps"
```

---

## Task 3: List + create API route

**Files:**
- Create: `src/app/api/prospects/route.ts`

- [ ] **Step 1: Write the route**

Mirror `src/app/api/customers/route.ts` exactly for auth + error shape. Add a `stato` filter and keep the same `search` behavior.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SOURCES = ["contatto_personale", "lista", "social", "referenza", "altro"];

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get("search") || "";
  const stato = request.nextUrl.searchParams.get("stato") || "";

  let query = supabase
    .from("prospects")
    .select("*")
    .eq("partner_id", user.id)
    .order("created_at", { ascending: false });

  if (stato) {
    query = query.eq("stato", stato);
  }

  if (search) {
    query = query.or(
      `nome.ilike.%${search}%,telefono.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ prospects: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { nome, telefono, email, citta, source, note } = body;

    if (!nome || !nome.trim()) {
      return NextResponse.json(
        { error: "Il nome è obbligatorio" },
        { status: 400 }
      );
    }

    const safeSource = SOURCES.includes(source) ? source : "altro";

    const { data, error } = await supabase
      .from("prospects")
      .insert({
        partner_id: user.id,
        nome: nome.trim(),
        telefono: telefono?.trim() || null,
        email: email?.trim() || null,
        citta: citta?.trim() || null,
        source: safeSource,
        note: note?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ prospect: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 3: Manual smoke test (dev server)**

Start `npm run dev` if not running. While logged in as `alessandro@iseven.it`, in the browser devtools console on the app origin run:
```js
await fetch('/api/prospects').then(r => r.json())
```
Expected: `{ prospects: [] }` (empty array, status 200). A 401 means you're not logged in.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/prospects/route.ts
git commit -m "feat(prospects): add list + create API route"
```

---

## Task 4: Detail / update / delete API route

**Files:**
- Create: `src/app/api/prospects/[id]/route.ts`

- [ ] **Step 1: Write the route**

Mirror `src/app/api/customers/[id]/route.ts`. Use `PATCH` (partial update) and whitelist Phase 1 fields including pipeline `stato` and follow-up fields. DELETE is a hard delete (no dependent rows in Phase 1).

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EDITABLE_FIELDS = [
  "nome",
  "telefono",
  "email",
  "citta",
  "source",
  "note",
  "stato",
  "sub_tag_follow_up",
  "sub_tag_custom",
  "cadenza_giorni",
  "prossima_data_reminder",
];

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
    .from("prospects")
    .select("*")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Contatto non trovato" }, { status: 404 });
  }

  return NextResponse.json({ prospect: data });
}

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
    const updates: Record<string, unknown> = {};

    for (const field of EDITABLE_FIELDS) {
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
      .from("prospects")
      .update(updates)
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

export async function DELETE(
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

  const { error } = await supabase
    .from("prospects")
    .delete()
    .eq("id", id)
    .eq("partner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 3: Manual round-trip test (dev server)**

In the app browser console (logged in):
```js
// create
const c = await fetch('/api/prospects', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nome:'Test Lead', source:'social'})}).then(r=>r.json());
// update stato
const u = await fetch(`/api/prospects/${c.prospect.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({stato:'follow_up', sub_tag_follow_up:'interessato_non_ora'})}).then(r=>r.json());
console.log(u.prospect.stato, u.prospect.sub_tag_follow_up);
// delete
const d = await fetch(`/api/prospects/${c.prospect.id}`, {method:'DELETE'}).then(r=>r.json());
console.log(d);
```
Expected: logs `follow_up interessato_non_ora` then `{ success: true }`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/prospects/[id]/route.ts
git commit -m "feat(prospects): add detail/update/delete API route"
```

---

## Task 5: Contatti page — list (desktop table + mobile cards)

**Files:**
- Create: `src/app/(dashboard)/contatti/page.tsx`

- [ ] **Step 1: Write the page (list + create form + stato filter), no edit modal yet**

Follows `src/app/(dashboard)/clienti/page.tsx` conventions: `"use client"`, `inputClass` constant, loading spinner, fetch helpers. Adds the mandatory **desktop table (`hidden md:block`) + mobile cards (`md:hidden`)** per project convention. The edit modal is added in Task 6.

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  type Prospect,
  type ProspectStato,
  SOURCE_LABELS,
  STATO_LABELS,
  STATO_BADGE,
} from "@/lib/types/prospects";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

const STATO_FILTERS: (ProspectStato | "tutti")[] = [
  "tutti",
  "nuovo_contatto",
  "primo_appt",
  "secondo_appt",
  "follow_up",
  "convertito_cliente",
  "convertito_partner",
];

export default function ContattiPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statoFilter, setStatoFilter] = useState<ProspectStato | "tutti">("tutti");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    telefono: "",
    email: "",
    citta: "",
    source: "contatto_personale",
    note: "",
  });

  useEffect(() => {
    fetchProspects();
  }, []);

  async function fetchProspects() {
    setLoading(true);
    const res = await fetch("/api/prospects");
    const data = await res.json();
    setProspects(data.prospects || []);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.nome.trim()) return;
    setSaving(true);
    const res = await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (res.ok) {
      setFormData({ nome: "", telefono: "", email: "", citta: "", source: "contatto_personale", note: "" });
      setShowForm(false);
      fetchProspects();
    }
    setSaving(false);
  }

  const filtered = prospects.filter((p) => {
    if (statoFilter !== "tutti" && p.stato !== statoFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.nome.toLowerCase().includes(q) ||
      (p.telefono && p.telefono.includes(q)) ||
      (p.email && p.email.toLowerCase().includes(q))
    );
  });

  function getInitials(p: Prospect) {
    return p.nome.trim().slice(0, 2).toUpperCase();
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Contatti</h2>
          <p className="text-text-secondary text-sm mt-1">
            {prospects.length} contatti nella pipeline
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
        >
          {showForm ? "Annulla" : "+ Nuovo Contatto"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-bg-card border border-border rounded-2xl p-4 md:p-6 mb-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <input type="text" placeholder="Nome *" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required className={inputClass} />
            <input type="tel" placeholder="Telefono" value={formData.telefono} onChange={(e) => setFormData({ ...formData, telefono: e.target.value })} className={inputClass} />
            <input type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={inputClass} />
            <input type="text" placeholder="Città" value={formData.citta} onChange={(e) => setFormData({ ...formData, citta: e.target.value })} className={inputClass} />
            <select value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} className={inputClass}>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input type="text" placeholder="Note" value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} className={inputClass} />
          </div>
          <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
            {saving ? "Salvataggio..." : "Salva contatto"}
          </button>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATO_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatoFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statoFilter === s
                ? "bg-accent text-white"
                : "bg-bg-section text-text-secondary hover:text-text-primary"
            }`}
          >
            {s === "tutti" ? "Tutti" : STATO_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm mb-6">
        <input
          type="text"
          placeholder="Cerca contatto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-border bg-bg-card text-text-primary placeholder-text-gentle focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-gentle">🔍</span>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-divider text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">Contatti</th>
              <th className="px-4 py-3 font-semibold">Provenienza</th>
              <th className="px-4 py-3 font-semibold">Stato</th>
              <th className="px-4 py-3 font-semibold">Prossima azione</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-divider last:border-0 hover:bg-bg-section/50 transition-colors">
                <td className="px-4 py-3 font-semibold text-text-primary">{p.nome}</td>
                <td className="px-4 py-3 text-text-secondary">
                  <div className="flex flex-col">
                    {p.telefono && <span>{p.telefono}</span>}
                    {p.email && <span className="text-xs">{p.email}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-text-secondary">{SOURCE_LABELS[p.source]}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-md text-xs font-semibold ${STATO_BADGE[p.stato]}`}>
                    {STATO_LABELS[p.stato]}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {p.prossima_data_reminder
                    ? new Date(p.prossima_data_reminder).toLocaleDateString("it-IT")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="bg-bg-card border border-border rounded-xl p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white text-sm font-bold shrink-0">
              {getInitials(p)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-text-primary">{p.nome}</div>
              <div className="text-xs text-text-secondary flex flex-wrap gap-x-3">
                {p.telefono && <span>{p.telefono}</span>}
                {p.citta && <span>{p.citta}</span>}
              </div>
            </div>
            <span className={`px-2 py-1 rounded-md text-xs font-semibold shrink-0 ${STATO_BADGE[p.stato]}`}>
              {STATO_LABELS[p.stato]}
            </span>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-text-secondary text-sm">
          {prospects.length === 0
            ? "Nessun contatto. Aggiungine uno con il bottone qui sopra."
            : "Nessun contatto trovato con i filtri attivi."}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 3: Manual visual check (preview)**

Open the running dev server, navigate to `/contatti`. Create a contact via "+ Nuovo Contatto". Confirm: it appears in the desktop table; resizing below `md` shows the card layout; the stato filter chips and search both narrow the list.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/contatti/page.tsx"
git commit -m "feat(prospects): add contatti list page with table + mobile cards"
```

---

## Task 6: Contatti page — edit modal (update stato, sub-tag, cadence, reminder, delete)

**Files:**
- Modify: `src/app/(dashboard)/contatti/page.tsx`

This task adds row-click → edit modal with the full pipeline controls and delete, mirroring the `clienti` edit modal. The conditional sub-tag block (shown only when `stato === 'follow_up'`) is the one piece of new logic.

- [ ] **Step 1: Add edit state + handlers near the existing create state**

Insert after the `formData` state block, before `useEffect`:

```tsx
  const [editProspect, setEditProspect] = useState<Prospect | null>(null);
  const [editForm, setEditForm] = useState({
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
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
```

- [ ] **Step 2: Add the open/close/update/delete handlers**

Insert after `handleCreate`:

```tsx
  function openEdit(p: Prospect) {
    setEditProspect(p);
    setEditForm({
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
    setConfirmDelete(false);
  }

  function closeEdit() {
    setEditProspect(null);
    setConfirmDelete(false);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editProspect || !editForm.nome.trim()) return;
    setEditSaving(true);
    const payload = {
      ...editForm,
      sub_tag_follow_up:
        editForm.stato === "follow_up" ? editForm.sub_tag_follow_up || null : null,
      sub_tag_custom:
        editForm.stato === "follow_up" && editForm.sub_tag_follow_up === "custom"
          ? editForm.sub_tag_custom
          : null,
      prossima_data_reminder: editForm.prossima_data_reminder || null,
    };
    const res = await fetch(`/api/prospects/${editProspect.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      closeEdit();
      fetchProspects();
    }
    setEditSaving(false);
  }

  async function handleDelete() {
    if (!editProspect) return;
    setDeleting(true);
    const res = await fetch(`/api/prospects/${editProspect.id}`, { method: "DELETE" });
    if (res.ok) {
      closeEdit();
      fetchProspects();
    }
    setDeleting(false);
  }
```

- [ ] **Step 3: Make rows/cards clickable**

In the desktop table, change the `<tr>` opening tag to add a click handler and cursor:
```tsx
              <tr key={p.id} onClick={() => openEdit(p)} className="border-b border-divider last:border-0 hover:bg-bg-section/50 transition-colors cursor-pointer">
```
In the mobile cards, change the card `<div>` to a `<button>`:
```tsx
          <button
            key={p.id}
            onClick={() => openEdit(p)}
            className="w-full text-left bg-bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:shadow-md hover:border-accent/30 transition-all"
          >
```
and change its closing `</div>` to `</button>`.

- [ ] **Step 4: Add the edit modal JSX before the final closing `</div>` of the component**

Mirror the `clienti` modal structure. Import `SUB_TAG_LABELS` by extending the existing import from `@/lib/types/prospects`.

```tsx
      {editProspect && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
          <div className="bg-bg-card border border-border rounded-2xl w-full max-w-lg shadow-xl mb-8">
            <div className="flex items-center justify-between p-5 border-b border-divider">
              <h3 className="text-lg font-bold text-text-primary">Modifica contatto</h3>
              <button onClick={closeEdit} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
            </div>

            <form onSubmit={handleUpdate} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Nome *</label>
                  <input type="text" value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} required className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Telefono</label>
                  <input type="tel" value={editForm.telefono} onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Email</label>
                  <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Città</label>
                  <input type="text" value={editForm.citta} onChange={(e) => setEditForm({ ...editForm, citta: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Provenienza</label>
                  <select value={editForm.source} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })} className={inputClass}>
                    {Object.entries(SOURCE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Stato pipeline</label>
                  <select value={editForm.stato} onChange={(e) => setEditForm({ ...editForm, stato: e.target.value as ProspectStato })} className={inputClass}>
                    {Object.entries(STATO_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                  </select>
                </div>
              </div>

              {editForm.stato === "follow_up" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-divider pt-4">
                  <div>
                    <label className="text-xs font-semibold text-text-secondary mb-1 block">Motivo follow-up</label>
                    <select value={editForm.sub_tag_follow_up} onChange={(e) => setEditForm({ ...editForm, sub_tag_follow_up: e.target.value })} className={inputClass}>
                      <option value="">— seleziona —</option>
                      {Object.entries(SUB_TAG_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                    </select>
                  </div>
                  {editForm.sub_tag_follow_up === "custom" && (
                    <div>
                      <label className="text-xs font-semibold text-text-secondary mb-1 block">Specifica</label>
                      <input type="text" value={editForm.sub_tag_custom} onChange={(e) => setEditForm({ ...editForm, sub_tag_custom: e.target.value })} className={inputClass} />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-text-secondary mb-1 block">Cadenza (giorni)</label>
                    <input type="number" min={1} value={editForm.cadenza_giorni} onChange={(e) => setEditForm({ ...editForm, cadenza_giorni: parseInt(e.target.value) || 14 })} className={inputClass} />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">Prossima azione (data)</label>
                <input type="date" value={editForm.prossima_data_reminder} onChange={(e) => setEditForm({ ...editForm, prossima_data_reminder: e.target.value })} className={inputClass} />
              </div>

              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">Note</label>
                <textarea value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} rows={2} className={`${inputClass} resize-none`} />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-divider">
                <div>
                  {!confirmDelete ? (
                    <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm text-coral font-medium hover:opacity-70 transition-opacity">Elimina contatto</button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={handleDelete} disabled={deleting} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-coral text-white hover:opacity-80 transition-all disabled:opacity-50">
                        {deleting ? "..." : "Conferma eliminazione"}
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(false)} className="text-sm text-text-secondary hover:text-text-primary transition-colors">Annulla</button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={closeEdit} className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:bg-bg-section transition-all">Annulla</button>
                  <button type="submit" disabled={editSaving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
                    {editSaving ? "..." : "Salva"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Update the import line**

Change the import at the top of the file to include `SUB_TAG_LABELS`:
```tsx
import {
  type Prospect,
  type ProspectStato,
  SOURCE_LABELS,
  STATO_LABELS,
  STATO_BADGE,
  SUB_TAG_LABELS,
} from "@/lib/types/prospects";
```

- [ ] **Step 6: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 7: Manual full-flow check (preview)**

On `/contatti`: click a row → modal opens. Change stato to "Follow-up" → the sub-tag/cadence block appears; choose "Altro (personalizzato)" → the "Specifica" field appears. Set a "Prossima azione" date, Save → table row shows the new badge + date. Re-open, click "Elimina contatto" → "Conferma eliminazione" → row disappears.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/contatti/page.tsx"
git commit -m "feat(prospects): add edit modal with pipeline state + follow-up + delete"
```

---

## Task 7: Sidebar cleanup — remove dead `/prospect` nav item

**Files:**
- Modify: `src/components/sidebar.tsx:48-56`

The "Persone" section currently lists both `Contatti → /contatti` (now real) and `Prospect → /prospect` (dead — no such route). The prospect functionality now lives at `/contatti`, so remove the duplicate.

- [ ] **Step 1: Remove the Prospect menu item**

In the `Persone` section items array, delete this line:
```tsx
      { name: "Prospect", icon: UserPlus, href: "/prospect" },
```

- [ ] **Step 2: Remove the now-unused `UserPlus` import**

In the lucide-react import block, delete the `UserPlus,` line. (Leave `Contact` — still used by the Contatti item.)

- [ ] **Step 3: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors (lint would flag `UserPlus` as unused if left).

- [ ] **Step 4: Manual check (preview)**

Reload the app. The "Persone" section shows: I miei Clienti, Contatti, Il mio Team — no "Prospect" item. Clicking "Contatti" navigates to the new page.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "chore(sidebar): remove dead /prospect nav, contatti is the pipeline page"
```

---

## Task 8: Update CLAUDE.md + project docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a "Contatti / Prospect" subsection under "Feature in produzione"**

Add after the "Clienti" feature block:

```markdown
### Contatti / Prospect (pipeline lead)
- CRUD prospect su `/contatti` (tabella `prospects`, RLS `partner_id`)
- Campi: nome, telefono, email, città, source (contatto_personale/lista/social/referenza/altro), note
- Stato pipeline: nuovo_contatto → primo_appt → secondo_appt → convertito_cliente/convertito_partner/follow_up
- Follow-up con sub-tag (interessato_non_ora/necessita_info/ha_detto_no/custom) + cadenza giorni + prossima_data_reminder
- Vista desktop tabella + mobile card, filtri per stato + ricerca
- **Phase 1 only**: appuntamenti, Google Calendar, email/WhatsApp, conversione e analytics sono Fasi 2-3 (vedi `docs/superpowers/specs/2026-06-20-prospects-design.md`)
```

- [ ] **Step 2: Note migration 007 in the migrations line**

In the "Architettura DB" section, update the "Migration applicate" line to append `, 007_prospects.sql`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): document Contatti/Prospect Phase 1 feature"
```

---

## Self-Review

**Spec coverage (Phase 1 rows of the spec):**
- CRUD prospect (name/phone/email/city/source/notes) → Tasks 3, 4, 5, 6 ✓
- Pipeline states → enum in Task 1, edited in Task 6 ✓
- Situational tag + sub-tag for follow-up → Task 1 columns, Task 6 conditional UI ✓
- Next action date (reminder) → `prossima_data_reminder`, Task 6 date input, shown in Task 5 table ✓
- Responsive UI (desktop table + mobile card) → Task 5 ✓
- Partner-isolated (no leader visibility) → RLS in Task 1 + `partner_id` filters in Tasks 3–4 ✓
- (Out of Phase 1 — appointments, messaging, conversion, analytics — explicitly deferred in scope boundary) ✓

**Placeholder scan:** No TBD/TODO. Every code step shows full code. Manual-check steps give exact console snippets / click sequences. ✓

**Type consistency:** `Prospect`, `ProspectStato`, `ProspectSource`, `ProspectSubTag`, and the maps `SOURCE_LABELS` / `STATO_LABELS` / `STATO_BADGE` / `SUB_TAG_LABELS` are defined once in Task 2 and consumed with identical names in Tasks 5–6. API editable-field whitelist (Task 4) matches the columns set by the edit form (Task 6). Migration column names (Task 1) match the `Prospect` interface (Task 2). ✓

**Dashboard reminder note:** The spec's "dashboard reminder" for next-action dates is satisfied minimally in Phase 1 by surfacing `prossima_data_reminder` in the table. A dedicated dashboard panel (like the existing `promemoria-panel.tsx` for customer dates) is a natural Phase 2 add and is intentionally not built here to keep Phase 1 tight.
