# Prospect Management — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the pipeline — convert a prospect to a customer (prefilled customer form) or to a partner (surface the partner's invite link to share), and add an analytics page showing pipeline counts + conversion metrics.

**Architecture:** Zero migration, zero external dependencies. The `prospects` table already has the conversion columns (`convertito_a`, `customer_id`, `profile_id_nuovo_partner`, `data_conversione`) from migration 007. Convert-to-customer inserts a `customers` row and links it back; convert-to-partner reads the partner's own `invite_url_slug` server-side and returns it for the existing `/invite/[slug]` flow (no profile is created — the prospect self-registers). Analytics aggregates the partner's prospects in one endpoint.

**Tech Stack:** Next.js 16 (App Router, TS), Supabase (Postgres + RLS), Tailwind v4.

**Verification note:** No test framework in this repo. Verify each task with `npm run lint` (new files clean; pre-existing lint problems in other files are out of scope — when adding a `fetch()`-in-`useEffect`, add `// eslint-disable-next-line react-hooks/set-state-in-effect` on the call line, matching the Phase 2 convention), `npm run build`, and manual checks on the dev server.

**Scope boundary:** Phase 3 completes the spec. Convert-to-partner surfaces the invite link only (no auto profile creation, no `profile_id_nuovo_partner` linking — reserved). Analytics is per-partner (RLS-isolated). No prospect sharing (explicitly out of scope per the spec).

---

## Prerequisites

- Phases 1 + 2 merged and deployed; migrations 007 + 008 applied.
- The partner's profile has `invite_url_slug` set (Alejerry: `8044484`).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/types/prospects.ts` | Add `ProspectAnalytics` type | Modify |
| `src/app/api/prospects/[id]/convert/route.ts` | `POST` convert to cliente/partner | Create |
| `src/app/api/prospects/analytics/route.ts` | `GET` pipeline + conversion metrics | Create |
| `src/components/prospects/convert-modal.tsx` | Conversion flow (customer form OR partner invite link) | Create |
| `src/app/(dashboard)/contatti/analytics/page.tsx` | Analytics dashboard | Create |
| `src/app/(dashboard)/contatti/[id]/page.tsx` | "Converti" button + converted-status banner | Modify |
| `src/app/(dashboard)/contatti/page.tsx` | "Analytics" header link | Modify |
| `CLAUDE.md` | Document Phase 3 | Modify |

**No migration in Phase 3** — conversion columns already exist (migration 007).

---

## Task 1: Add analytics type

**Files:**
- Modify: `src/lib/types/prospects.ts`

- [ ] **Step 1: Append the analytics type at the end of the file**

```typescript
export interface ProspectAnalytics {
  pipeline: Record<ProspectStato, number>;
  totale: number;
  conversione: {
    cliente: number;
    partner: number;
    cliente_percent: number;
    partner_percent: number;
    tempo_medio_giorni: number | null;
    convertiti_questo_mese: number;
    convertiti_mese_scorso: number;
  };
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/prospects.ts
git commit -m "feat(prospects): add ProspectAnalytics type"
```

---

## Task 2: Convert API

**Files:**
- Create: `src/app/api/prospects/[id]/convert/route.ts`

Convert-to-cliente inserts a `customers` row (same columns as `src/app/api/customers/route.ts`) and links it. Convert-to-partner reads the caller's `invite_url_slug` (fallback `codice_amway`) and returns it. Both reject an already-converted prospect.

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  // Load prospect (ownership) and guard against double conversion
  const { data: prospect } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (!prospect) {
    return NextResponse.json({ error: "Contatto non trovato" }, { status: 404 });
  }
  if (prospect.convertito_a) {
    return NextResponse.json(
      { error: "Questo contatto è già stato convertito" },
      { status: 409 }
    );
  }

  let body: { convertTo?: string; customerData?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (body.convertTo === "cliente") {
    const c = body.customerData || {};
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .insert({
        partner_id: user.id,
        nome: (c.nome || prospect.nome).trim(),
        cognome: c.cognome?.trim() || null,
        telefono: c.telefono?.trim() || prospect.telefono || null,
        email: c.email?.trim() || prospect.email || null,
        indirizzo: c.indirizzo?.trim() || null,
        citta: c.citta?.trim() || prospect.citta || null,
        note: c.note?.trim() || prospect.note || null,
      })
      .select()
      .single();

    if (custErr) {
      return NextResponse.json({ error: custErr.message }, { status: 500 });
    }

    const { data: updated, error: updErr } = await supabase
      .from("prospects")
      .update({
        stato: "convertito_cliente",
        convertito_a: "cliente",
        customer_id: customer.id,
        data_conversione: now,
        updated_at: now,
      })
      .eq("id", id)
      .eq("partner_id", user.id)
      .select()
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ prospect: updated, customer }, { status: 201 });
  }

  if (body.convertTo === "partner") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("invite_url_slug, codice_amway")
      .eq("id", user.id)
      .single();

    const inviteSlug = profile?.invite_url_slug || profile?.codice_amway || null;

    const { data: updated, error: updErr } = await supabase
      .from("prospects")
      .update({
        stato: "convertito_partner",
        convertito_a: "partner",
        data_conversione: now,
        updated_at: now,
      })
      .eq("id", id)
      .eq("partner_id", user.id)
      .select()
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ prospect: updated, inviteSlug });
  }

  return NextResponse.json(
    { error: "convertTo deve essere 'cliente' o 'partner'" },
    { status: 400 }
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors in new files; `/api/prospects/[id]/convert` in the manifest.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/prospects/[id]/convert/route.ts"
git commit -m "feat(prospects): convert API (to customer / to partner)"
```

---

## Task 3: Analytics API

**Files:**
- Create: `src/app/api/prospects/analytics/route.ts`

Aggregates the partner's prospects into pipeline counts + conversion metrics. All computation is in-handler over a single select (the dataset is small — one partner's prospects).

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STATI = [
  "nuovo_contatto",
  "primo_appt",
  "secondo_appt",
  "convertito_cliente",
  "convertito_partner",
  "follow_up",
] as const;

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("prospects")
    .select("stato, created_at, data_conversione, convertito_a")
    .eq("partner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const totale = rows.length;

  const pipeline = Object.fromEntries(STATI.map((s) => [s, 0])) as Record<
    (typeof STATI)[number],
    number
  >;
  for (const r of rows) {
    if (r.stato in pipeline) pipeline[r.stato as (typeof STATI)[number]]++;
  }

  const cliente = pipeline.convertito_cliente;
  const partner = pipeline.convertito_partner;

  // Average days from creation to conversion
  const durations: number[] = [];
  for (const r of rows) {
    if (r.convertito_a && r.data_conversione) {
      const d =
        (new Date(r.data_conversione).getTime() -
          new Date(r.created_at).getTime()) /
        86400000;
      if (d >= 0) durations.push(d);
    }
  }
  const tempo_medio_giorni =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  // This month vs last month, by conversion date
  const now = new Date();
  const startThis = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  let convertiti_questo_mese = 0;
  let convertiti_mese_scorso = 0;
  for (const r of rows) {
    if (!r.convertito_a || !r.data_conversione) continue;
    const dc = new Date(r.data_conversione);
    if (dc >= startThis) convertiti_questo_mese++;
    else if (dc >= startLast && dc < startThis) convertiti_mese_scorso++;
  }

  return NextResponse.json({
    pipeline,
    totale,
    conversione: {
      cliente,
      partner,
      cliente_percent: totale > 0 ? Math.round((cliente / totale) * 100) : 0,
      partner_percent: totale > 0 ? Math.round((partner / totale) * 100) : 0,
      tempo_medio_giorni,
      convertiti_questo_mese,
      convertiti_mese_scorso,
    },
  });
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors in new files; `/api/prospects/analytics` in the manifest.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/prospects/analytics/route.ts"
git commit -m "feat(prospects): analytics API (pipeline + conversion metrics)"
```

---

## Task 4: Convert modal component

**Files:**
- Create: `src/components/prospects/convert-modal.tsx`

Step 1 of the modal asks "Converti a: Cliente / Partner". Cliente shows a prefilled customer form; Partner converts immediately and shows the invite link with copy + share (mailto/wa.me) buttons.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import type { Prospect } from "@/lib/types/prospects";
import { buildMailto, buildWhatsappUrl } from "@/lib/prospects/links";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

type Props = {
  prospect: Prospect;
  onConverted: () => void;
  onClose: () => void;
};

export function ConvertModal({ prospect, onConverted, onClose }: Props) {
  const [mode, setMode] = useState<"choose" | "cliente" | "partner">("choose");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [custForm, setCustForm] = useState({
    nome: prospect.nome,
    cognome: "",
    telefono: prospect.telefono || "",
    email: prospect.email || "",
    indirizzo: "",
    citta: prospect.citta || "",
    note: prospect.note || "",
  });

  async function convertCliente(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch(`/api/prospects/${prospect.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ convertTo: "cliente", customerData: custForm }),
    });
    if (res.ok) {
      onConverted();
      onClose();
    } else {
      const d = await res.json();
      setError(d.error || "Errore durante la conversione");
    }
    setSaving(false);
  }

  async function convertPartner() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/prospects/${prospect.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ convertTo: "partner" }),
    });
    const d = await res.json();
    if (res.ok) {
      const slug = d.inviteSlug;
      setInviteUrl(slug ? `${window.location.origin}/invite/${slug}` : null);
      setMode("partner");
      onConverted();
    } else {
      setError(d.error || "Errore durante la conversione");
    }
    setSaving(false);
  }

  function copyLink() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const inviteMessage = inviteUrl
    ? `Ciao ${prospect.nome.split(" ")[0]}! Ecco il link per registrarti: ${inviteUrl}`
    : "";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md shadow-xl mb-8">
        <div className="flex items-center justify-between p-5 border-b border-divider">
          <h3 className="text-lg font-bold text-text-primary">
            Converti {prospect.nome}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {error && <p className="text-sm text-coral">{error}</p>}

          {mode === "choose" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button onClick={() => setMode("cliente")} className="p-4 rounded-xl border border-border hover:border-accent hover:bg-accent-glow transition-all text-left">
                <div className="text-2xl mb-1">🛒</div>
                <div className="font-semibold text-sm text-text-primary">A Cliente</div>
                <div className="text-xs text-text-secondary">Crea una scheda cliente</div>
              </button>
              <button onClick={convertPartner} disabled={saving} className="p-4 rounded-xl border border-border hover:border-accent hover:bg-accent-glow transition-all text-left disabled:opacity-50">
                <div className="text-2xl mb-1">🤝</div>
                <div className="font-semibold text-sm text-text-primary">A Partner</div>
                <div className="text-xs text-text-secondary">Genera link di invito</div>
              </button>
            </div>
          )}

          {mode === "cliente" && (
            <form onSubmit={convertCliente} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Nome *</label>
                  <input type="text" required value={custForm.nome} onChange={(e) => setCustForm({ ...custForm, nome: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Cognome</label>
                  <input type="text" value={custForm.cognome} onChange={(e) => setCustForm({ ...custForm, cognome: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Telefono</label>
                  <input type="tel" value={custForm.telefono} onChange={(e) => setCustForm({ ...custForm, telefono: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Email</label>
                  <input type="email" value={custForm.email} onChange={(e) => setCustForm({ ...custForm, email: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Indirizzo</label>
                  <input type="text" value={custForm.indirizzo} onChange={(e) => setCustForm({ ...custForm, indirizzo: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Città</label>
                  <input type="text" value={custForm.citta} onChange={(e) => setCustForm({ ...custForm, citta: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-divider">
                <button type="button" onClick={() => setMode("choose")} className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:bg-bg-section transition-all">Indietro</button>
                <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
                  {saving ? "..." : "Crea cliente"}
                </button>
              </div>
            </form>
          )}

          {mode === "partner" && (
            <div className="space-y-3">
              {inviteUrl ? (
                <>
                  <p className="text-sm text-text-secondary">Condividi questo link con {prospect.nome.split(" ")[0]} per registrarsi come partner:</p>
                  <div className="flex gap-2">
                    <input readOnly value={inviteUrl} className={inputClass} />
                    <button onClick={copyLink} className="px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all shrink-0">
                      {copied ? "Copiato!" : "Copia"}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {prospect.email && (
                      <a href={buildMailto(prospect.email, "Il tuo link di registrazione", inviteMessage)} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all">✉️ Email</a>
                    )}
                    {prospect.telefono && (
                      <a href={buildWhatsappUrl(prospect.telefono, inviteMessage)} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-3 py-2 rounded-xl text-sm font-semibold bg-[#25D366] text-white hover:opacity-90 transition-all">WhatsApp</a>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-coral">Nessun link di invito disponibile. Imposta un codice Amway nel tuo profilo.</p>
              )}
              <div className="flex justify-end pt-2 border-t border-divider">
                <button type="button" onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all">Fatto</button>
              </div>
            </div>
          )}
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
git add src/components/prospects/convert-modal.tsx
git commit -m "feat(prospects): convert modal (customer form / partner invite link)"
```

---

## Task 5: Wire convert into the detail page

**Files:**
- Modify: `src/app/(dashboard)/contatti/[id]/page.tsx`

- [ ] **Step 1: Import the modal**

After the `MessageTemplateModal` import, add:
```tsx
import { ConvertModal } from "@/components/prospects/convert-modal";
```

- [ ] **Step 2: Add modal state**

After `const [msgModal, setMsgModal] = useState<"email" | "whatsapp" | null>(null);`, add:
```tsx
  const [showConvert, setShowConvert] = useState(false);
```

- [ ] **Step 3: Add the Convert button / converted banner in the header**

Replace the header block:
```tsx
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
```
with:
```tsx
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
        {prospect.convertito_a ? (
          <span className="text-xs font-semibold text-success">
            ✓ Convertito a {prospect.convertito_a}
          </span>
        ) : (
          <button onClick={() => setShowConvert(true)} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-success text-white hover:opacity-90 transition-all">
            Converti
          </button>
        )}
      </div>
```

- [ ] **Step 4: Render the modal**

Before the final closing `</div>` of the component (after the `{msgModal && (...)}` block), add:
```tsx
      {showConvert && (
        <ConvertModal
          prospect={prospect}
          onConverted={fetchAll}
          onClose={() => setShowConvert(false)}
        />
      )}
```

- [ ] **Step 5: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 6: Manual check (preview)**

Open a prospect detail page → "Converti" → choose "A Cliente": form prefilled, submit → header shows "✓ Convertito a cliente" and the customer appears under `/clienti`. On another prospect → "A Partner": invite link shows with Copia + Email/WhatsApp share buttons; header shows "✓ Convertito a partner".

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/contatti/[id]/page.tsx"
git commit -m "feat(prospects): convert button + converted status on detail page"
```

---

## Task 6: Analytics page

**Files:**
- Create: `src/app/(dashboard)/contatti/analytics/page.tsx`

Pipeline as labelled horizontal bars (pure CSS) + conversion `StatCard`s (reusing `src/components/ui/stat-card.tsx`). Trend card uses the month-over-month delta.

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type ProspectAnalytics,
  type ProspectStato,
  STATO_LABELS,
} from "@/lib/types/prospects";
import { StatCard } from "@/components/ui/stat-card";

const PIPELINE_ORDER: ProspectStato[] = [
  "nuovo_contatto",
  "primo_appt",
  "secondo_appt",
  "follow_up",
  "convertito_cliente",
  "convertito_partner",
];

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<ProspectAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAnalytics();
  }, []);

  async function fetchAnalytics() {
    setLoading(true);
    const res = await fetch("/api/prospects/analytics");
    const d = await res.json();
    setData(d);
    setLoading(false);
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const maxCount = Math.max(1, ...PIPELINE_ORDER.map((s) => data.pipeline[s]));
  const trend =
    data.conversione.convertiti_questo_mese - data.conversione.convertiti_mese_scorso;

  return (
    <div>
      <button onClick={() => router.push("/contatti")} className="text-sm text-text-secondary hover:text-text-primary mb-4 transition-colors">
        ← Contatti
      </button>

      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Analytics pipeline</h2>
        <p className="text-text-secondary text-sm mt-1">{data.totale} contatti totali</p>
      </div>

      {/* Pipeline bars */}
      <div className="bg-bg-card border border-border rounded-2xl p-5 mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary mb-4">Pipeline</h3>
        <div className="space-y-3">
          {PIPELINE_ORDER.map((s) => (
            <div key={s} className="flex items-center gap-3">
              <div className="w-40 text-sm text-text-secondary shrink-0">{STATO_LABELS[s]}</div>
              <div className="flex-1 bg-bg-section rounded-lg h-7 overflow-hidden">
                <div
                  className="h-full bg-accent rounded-lg flex items-center justify-end px-2"
                  style={{ width: `${(data.pipeline[s] / maxCount) * 100}%` }}
                >
                  {data.pipeline[s] > 0 && (
                    <span className="text-xs font-bold text-white">{data.pipeline[s]}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conversion metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Conversione cliente"
          value={`${data.conversione.cliente_percent}%`}
          subtitle={`${data.conversione.cliente} su ${data.totale}`}
          color="success"
        />
        <StatCard
          label="Conversione partner"
          value={`${data.conversione.partner_percent}%`}
          subtitle={`${data.conversione.partner} su ${data.totale}`}
          color="accent"
        />
        <StatCard
          label="Tempo medio conversione"
          value={data.conversione.tempo_medio_giorni !== null ? `${data.conversione.tempo_medio_giorni}g` : "—"}
          subtitle="da contatto a conversione"
          color="lavender"
        />
        <StatCard
          label="Convertiti questo mese"
          value={data.conversione.convertiti_questo_mese}
          trend={{ value: trend, label: "vs mese scorso" }}
          color="coral"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors; `/contatti/analytics` in the manifest.

- [ ] **Step 3: Manual check (preview)**

Visit `/contatti/analytics`. Pipeline bars reflect the counts per stage; the four conversion cards show percentages, average days, and the month trend. With converted prospects present, the cliente/partner percentages are non-zero.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/contatti/analytics/page.tsx"
git commit -m "feat(prospects): analytics page (pipeline bars + conversion metrics)"
```

---

## Task 7: Analytics link in the list header

**Files:**
- Modify: `src/app/(dashboard)/contatti/page.tsx`

- [ ] **Step 1: Add an "Analytics" button next to "Follow-up"**

In the header action `<div className="flex items-center gap-2">`, add before the Follow-up button:
```tsx
          <button
            onClick={() => router.push("/contatti/analytics")}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all"
          >
            Analytics
          </button>
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 3: Manual check (preview)**

On `/contatti`, the header shows Analytics + Follow-up + "+ Nuovo Contatto"; "Analytics" opens the dashboard.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/contatti/page.tsx"
git commit -m "feat(prospects): add analytics link to contatti header"
```

---

## Task 8: Docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the "Phase 3 (da fare)" bullet**

In the "Contatti / Prospect" section, replace:
```markdown
- **Phase 3 (da fare)**: conversione cliente/partner + analytics (vedi `docs/superpowers/specs/2026-06-20-prospects-design.md`)
```
with:
```markdown
- **Conversione**: pulsante "Converti" sulla detail page → a Cliente (crea `customers` row prefillata, link `prospects.customer_id`) o a Partner (mostra il link invito `/invite/[slug]` del partner da condividere via copia/email/WhatsApp). Stato → `convertito_cliente`/`convertito_partner`, `data_conversione` salvata. Guard anti-doppia-conversione.
- **Analytics** `/contatti/analytics`: pipeline (barre per stato) + metriche conversione (% cliente, % partner, tempo medio gg, trend mese su mese). Isolato per partner.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): document Contatti/Prospect Phase 3 (conversion + analytics)"
```

---

## Self-Review

**Spec coverage (Phase 3 rows of the spec):**
- Convert to Customer (pre-populate form, link prospect↔customer) → Tasks 2, 4, 5 ✓
- Convert to Partner (generate invite link) → Tasks 2, 4, 5 (surfaces `/invite/[slug]`; no auto profile creation — `profile_id_nuovo_partner` reserved, documented) ✓
- Analytics — pipeline view → Tasks 3, 6 ✓
- Analytics — conversion metrics (% cliente, % partner, avg days, month trend) → Tasks 3, 6 ✓
- Per-partner isolation, no sharing → all queries filter `partner_id = auth.uid()` (Tasks 2, 3); RLS enforces ✓

**Placeholder scan:** No TBD/TODO. Every code step shows complete code. Manual checks give concrete sequences. ✓

**Type consistency:** `ProspectAnalytics` (Task 1) consumed in Task 6 with matching field names (`pipeline`, `totale`, `conversione.{cliente,partner,cliente_percent,partner_percent,tempo_medio_giorni,convertiti_questo_mese,convertiti_mese_scorso}`) — matches the API response shape (Task 3). `ConvertModal` props (`prospect`, `onConverted`, `onClose`) match the call site (Task 5). Convert API `convertTo`/`customerData` body (Task 2) matches the modal's fetch payloads (Task 4). Customer insert columns (Task 2) match the `customers` table used by `src/app/api/customers/route.ts`. ✓

**Cross-cutting checks:**
- No migration required — conversion columns exist from migration 007. ✓
- Double-conversion guard returns 409 (Task 2); UI hides the Convert button once `convertito_a` is set (Task 5). ✓
- Convert-to-cliente reuses prospect field fallbacks so a sparse prospect still produces a valid customer (nome always present). ✓
- Invite link built client-side from `window.location.origin` + returned slug → works on any domain (metodo.growset.it or future weshare). ✓
- External setup required: **none.** Commits are local until the user pushes. ✓
