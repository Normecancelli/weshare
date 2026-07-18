# QR/Link fisso acquisizione contatti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un link/QR fisso per partner (`/contatto/[slug]`) che il prospect apre da solo, compila nome/cognome/telefono/email, e finisce automaticamente in `/contatti` — senza che il partner debba crearlo a mano.

**Architecture:** Nuova rotta pubblica `/contatto/[slug]` (slug = `profiles.invite_url_slug`, riusato — non un nuovo campo) che chiama una nuova API pubblica `POST /api/contatto/[slug]`: risolve il partner, fa upsert del prospect (dedup per telefono/email), genera un token vetrina (riusando la logica già esistente in `POST /api/prospects/[id]/preview-link`, estratta in un helper condiviso) e redirige a `/anteprima/[token]`. QR generato client-side con `qrcode`, nessuna chiamata esterna.

**Tech Stack:** Next.js 15 App Router (TypeScript), Supabase (Postgres + RLS), Tailwind CSS v4, `qrcode` (nuova dipendenza).

## Global Constraints

- Spec di riferimento: `docs/superpowers/specs/2026-07-18-qr-acquisizione-contatti-design.md` — ogni task implicitamente rispetta le decisioni lì scritte.
- Nessuna suite di test automatica in questo progetto: la verifica di ogni task è `npm run build` (typecheck + lint via Next) + verifica manuale in browser, come da convenzione di tutte le spec precedenti.
- API routes: sempre `supabase.auth.getUser()` prima della logica nelle route autenticate; `createAdminClient()` solo dove serve bypassare RLS (route pubbliche, upsert cross-check).
- Slug user-controlled: sempre `sanitizeSlug()` da `src/lib/auth/slug.ts`.
- Messaggi di errore/avviso in nuove superfici UI: componente condiviso `<InlineMessage variant="error|warning|success|info">` da `src/components/ui/inline-message.tsx`, non testo `text-coral` ad-hoc.
- Icone funzionali: `lucide-react` (già dipendenza), mai emoji per icone funzionali (le emoji esistenti in pagine più vecchie non vanno toccate, fuori scope).
- Locale italiano: nessuna stringa in inglese nella UI utente-facing.
- Niente commenti che spiegano il "cosa" — solo dove il "perché" non è ovvio dal codice.

---

## Task 1: Migration `source` + tipo `ProspectSource`

**Files:**
- Create: `supabase/migrations/017_qr_acquisizione_contatti.sql`
- Modify: `src/lib/types/prospects.ts`

**Interfaces:**
- Produces: valore `"qr_link"` aggiunto a `ProspectSource` e `SOURCE_LABELS`, usato da Task 3.

- [ ] **Step 1: Scrivi la migration**

```sql
-- supabase/migrations/017_qr_acquisizione_contatti.sql
-- Nuova sorgente prospect per i contatti arrivati dal form pubblico
-- /contatto/[slug] (QR/link fisso), per distinguerli in analytics dai
-- contatti inseriti a mano dal partner.
ALTER TABLE prospects DROP CONSTRAINT prospects_source_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_source_check
  CHECK (source IN ('contatto_personale', 'lista', 'social', 'referenza', 'altro', 'qr_link'));
```

- [ ] **Step 2: Applica la migration su Supabase**

Apri il SQL Editor del progetto (`https://supabase.com/dashboard/project/ietxuhkkahnvcbchfspt/sql/new`), incolla il contenuto del file e esegui.

Verifica con:

```sql
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'prospects'::regclass AND conname = 'prospects_source_check';
```

Expected: la definizione ritornata include `'qr_link'::text` nella lista IN (...).

Se il nome vincolo reale differisse da `prospects_source_check` (verificabile anche con `\d prospects` in psql), aggiorna lo `DROP CONSTRAINT` nel file con il nome corretto prima di eseguire.

- [ ] **Step 3: Aggiorna il tipo TypeScript**

In `src/lib/types/prospects.ts`, modifica:

```ts
export type ProspectSource =
  | "contatto_personale"
  | "lista"
  | "social"
  | "referenza"
  | "altro";
```

in:

```ts
export type ProspectSource =
  | "contatto_personale"
  | "lista"
  | "social"
  | "referenza"
  | "altro"
  | "qr_link";
```

e:

```ts
export const SOURCE_LABELS: Record<ProspectSource, string> = {
  contatto_personale: "Contatto personale",
  lista: "Lista nomi",
  social: "Social",
  referenza: "Referenza",
  altro: "Altro",
};
```

in:

```ts
export const SOURCE_LABELS: Record<ProspectSource, string> = {
  contatto_personale: "Contatto personale",
  lista: "Lista nomi",
  social: "Social",
  referenza: "Referenza",
  altro: "Altro",
  qr_link: "QR / Link contatti",
};
```

- [ ] **Step 4: Verifica**

Run: `npm run build`
Expected: build senza errori TypeScript.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/017_qr_acquisizione_contatti.sql src/lib/types/prospects.ts
git commit -m "feat(prospects): nuova sorgente qr_link per acquisizione contatti"
```

---

## Task 2: Estrai helper condiviso per il token vetrina

**Files:**
- Create: `src/lib/prospects/preview-link.ts`
- Modify: `src/app/api/prospects/[id]/preview-link/route.ts`

**Interfaces:**
- Produces: `upsertPreviewLink(client: SupabaseClient, prospectId: string): Promise<{ token: string; expiresAt: string } | { error: string }>` — usato da Task 3 (route pubblica) e dalla route autenticata esistente.
- Consumes: nessuna dipendenza da task precedenti.

- [ ] **Step 1: Crea l'helper**

```ts
// src/lib/prospects/preview-link.ts
import type { SupabaseClient } from "@supabase/supabase-js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function upsertPreviewLink(
  client: SupabaseClient,
  prospectId: string
): Promise<{ token: string; expiresAt: string } | { error: string }> {
  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS).toISOString();

  const { data, error } = await client
    .from("prospect_preview_links")
    .upsert(
      { prospect_id: prospectId, token, expires_at: expiresAt },
      { onConflict: "prospect_id" }
    )
    .select()
    .single();

  if (error) return { error: error.message };
  return { token: data.token, expiresAt: data.expires_at };
}
```

- [ ] **Step 2: Rifattorizza la route autenticata per usarlo**

Sostituisci il contenuto di `src/app/api/prospects/[id]/preview-link/route.ts` con:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { upsertPreviewLink } from "@/lib/prospects/preview-link";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: prospect } = await supabase
    .from("prospects")
    .select("id")
    .eq("id", id)
    .eq("partner_id", user.id)
    .single();

  if (!prospect) return NextResponse.json({ error: "Contatto non trovato" }, { status: 404 });

  const result = await upsertPreviewLink(supabase, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500 });

  const origin = request.nextUrl.origin;
  return NextResponse.json({ url: `${origin}/anteprima/${result.token}`, expiresAt: result.expiresAt });
}
```

- [ ] **Step 3: Verifica tipo**

Run: `npm run build`
Expected: nessun errore — `createClient()` (da `@/lib/supabase/server`) e `createAdminClient()` sono entrambi tipizzati `SupabaseClient` compatibile.

- [ ] **Step 4: Verifica manuale — nessuna regressione**

Con `npm run dev` attivo, apri una scheda prospect esistente in `/contatti/[id]`, genera un link vetrina come già fai oggi, apri il link in incognito e verifica che la pagina `/anteprima/[token]` mostri ancora eventi/contenuti correttamente (comportamento identico a prima della refactor).

- [ ] **Step 5: Commit**

```bash
git add src/lib/prospects/preview-link.ts src/app/api/prospects/[id]/preview-link/route.ts
git commit -m "refactor(prospects): estrae upsertPreviewLink in helper condiviso"
```

---

## Task 3: API pubblica `POST /api/contatto/[slug]`

**Files:**
- Create: `src/app/api/contatto/[slug]/route.ts`

**Interfaces:**
- Consumes: `sanitizeSlug(raw: string): string` da `src/lib/auth/slug.ts`; `createAdminClient()` da `src/lib/supabase/admin.ts`; `upsertPreviewLink()` da Task 2.
- Produces: `POST /api/contatto/[slug]` — body `{ nome, cognome?, telefono?, email?, website? }`, risponde `{ url: string }` o `{ error: string }`. Consumato da Task 7 (form pubblico).

- [ ] **Step 1: Scrivi la route**

```ts
// src/app/api/contatto/[slug]/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeSlug } from "@/lib/auth/slug";
import { upsertPreviewLink } from "@/lib/prospects/preview-link";

interface ContattoBody {
  nome?: string;
  cognome?: string;
  telefono?: string;
  email?: string;
  website?: string; // honeypot: deve restare vuoto
}

async function findExistingProspectId(
  admin: SupabaseClient,
  partnerId: string,
  telefono: string,
  email: string
): Promise<string | null> {
  if (telefono) {
    const { data } = await admin
      .from("prospects")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("telefono", telefono)
      .maybeSingle();
    if (data) return data.id;
  }
  if (email) {
    const { data } = await admin
      .from("prospects")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("email", email)
      .maybeSingle();
    if (data) return data.id;
  }
  return null;
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

  const { data: partner } = await admin
    .from("profiles")
    .select("id")
    .ilike("invite_url_slug", safeSlug)
    .limit(1)
    .maybeSingle();

  if (!partner) {
    return NextResponse.json({ error: "Link non valido" }, { status: 404 });
  }

  const nomeCompleto = [nome, cognome].filter(Boolean).join(" ");
  const existingId = await findExistingProspectId(admin, partner.id, telefono, email);

  let prospectId: string;

  if (existingId) {
    const { data: updated, error: updErr } = await admin
      .from("prospects")
      .update({
        nome: nomeCompleto,
        telefono: telefono || null,
        email: email || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingId)
      .select("id")
      .single();

    if (updErr || !updated) {
      return NextResponse.json({ error: "Errore durante il salvataggio" }, { status: 500 });
    }
    prospectId = updated.id;
  } else {
    const { data: created, error: insErr } = await admin
      .from("prospects")
      .insert({
        partner_id: partner.id,
        nome: nomeCompleto,
        telefono: telefono || null,
        email: email || null,
        source: "qr_link",
        stato: "nuovo_contatto",
      })
      .select("id")
      .single();

    if (insErr || !created) {
      return NextResponse.json({ error: "Errore durante il salvataggio" }, { status: 500 });
    }
    prospectId = created.id;
  }

  const linkResult = await upsertPreviewLink(admin, prospectId);
  if ("error" in linkResult) {
    return NextResponse.json({ error: linkResult.error }, { status: 500 });
  }

  const origin = request.nextUrl.origin;
  return NextResponse.json({ url: `${origin}/anteprima/${linkResult.token}` });
}
```

- [ ] **Step 2: Verifica tipo**

Run: `npm run build`
Expected: nessun errore TypeScript.

- [ ] **Step 3: Verifica manuale con curl**

Con `npm run dev` attivo e un partner reale che ha `invite_url_slug` impostato (es. `8044484`, vedi CLAUDE.md):

```bash
curl -s -X POST http://localhost:3000/api/contatto/8044484 \
  -H "Content-Type: application/json" \
  -d '{"nome":"Mario","cognome":"Rossi","telefono":"3331234567"}'
```

Expected: risposta `{"url":"http://localhost:3000/anteprima/<token>"}`. Verifica poi in `/contatti` che sia comparso "Mario Rossi" con provenienza "QR / Link contatti".

Ripeti la stessa chiamata: expected che il contatto in `/contatti` resti uno solo (aggiornato, non duplicato).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/contatto/\[slug\]/route.ts
git commit -m "feat(contatti): API pubblica creazione/aggiornamento prospect da QR/link fisso"
```

---

## Task 4: API pubblica `GET /api/prospects/public/[id]`

**Files:**
- Create: `src/app/api/prospects/public/[id]/route.ts`

**Interfaces:**
- Produces: `GET /api/prospects/public/[id]` → `{ prospect: { nome, telefono, email } | null }`. Consumato da Task 10 (`/registrati`).

- [ ] **Step 1: Scrivi la route**

```ts
// src/app/api/prospects/public/[id]/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: prospect } = await admin
    .from("prospects")
    .select("nome, telefono, email, convertito_a")
    .eq("id", id)
    .maybeSingle();

  if (!prospect || prospect.convertito_a) {
    return NextResponse.json({ prospect: null });
  }

  return NextResponse.json({
    prospect: {
      nome: prospect.nome,
      telefono: prospect.telefono,
      email: prospect.email,
    },
  });
}
```

- [ ] **Step 2: Verifica manuale**

```bash
curl -s http://localhost:3000/api/prospects/public/<id-di-un-prospect-non-convertito>
```

Expected: `{"prospect":{"nome":"...","telefono":"...","email":"..."}}`.

```bash
curl -s http://localhost:3000/api/prospects/public/<id-di-un-prospect-gia-convertito>
```

Expected: `{"prospect":null}`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/prospects/public/\[id\]/route.ts
git commit -m "feat(prospects): API pubblica minimale per prefill dati in /registrati"
```

---

## Task 5: Middleware — nuovi path pubblici

**Files:**
- Modify: `src/lib/supabase/middleware.ts:34-44`

**Interfaces:**
- Consumes: nessuna.
- Produces: `/contatto/*`, `/api/contatto/*`, `/api/prospects/public/*` accessibili senza sessione autenticata.

- [ ] **Step 1: Aggiorna `isPublicPath`**

Sostituisci:

```ts
  const isPublicPath =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/invite") ||
    path.startsWith("/anteprima") ||
    path.startsWith("/registrati") ||
    path === "/api/sponsor" ||
    path.startsWith("/api/sponsor/") ||
    path === "/api/profiles/platino-search" ||
    path === "/api/auth/signup" ||
    path.startsWith("/api/anteprima/");
```

con:

```ts
  const isPublicPath =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/invite") ||
    path.startsWith("/anteprima") ||
    path.startsWith("/registrati") ||
    path.startsWith("/contatto") ||
    path === "/api/sponsor" ||
    path.startsWith("/api/sponsor/") ||
    path === "/api/profiles/platino-search" ||
    path === "/api/auth/signup" ||
    path.startsWith("/api/anteprima/") ||
    path.startsWith("/api/contatto/") ||
    path.startsWith("/api/prospects/public/");
```

- [ ] **Step 2: Verifica**

Run: `npm run build`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "feat(middleware): rende pubblici /contatto e le relative API"
```

---

## Task 6: Dipendenza `qrcode` + componente `ContactQrCard`

**Files:**
- Modify: `package.json` (via `npm install`)
- Create: `src/components/prospects/contact-qr-card.tsx`

**Interfaces:**
- Produces: `<ContactQrCard slug={string | null} />` — usato da Task 8 (`/contatti`) e Task 9 (`/impostazioni`).

- [ ] **Step 1: Installa le dipendenze**

Run: `npm install qrcode`
Expected: `package.json` → `dependencies.qrcode` aggiunto con la versione risolta da npm.

Run: `npm install -D @types/qrcode`
Expected: `package.json` → `devDependencies["@types/qrcode"]` aggiunto.

- [ ] **Step 2: Crea il componente**

```tsx
// src/components/prospects/contact-qr-card.tsx
"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { InlineMessage } from "@/components/ui/inline-message";

type Props = {
  slug: string | null;
};

export function ContactQrCard({ slug }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) {
      setUrl(null);
      return;
    }
    setUrl(`${window.location.origin}/contatto/${slug}`);
  }, [slug]);

  useEffect(() => {
    if (!url) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    import("qrcode").then((mod) => {
      const QRCode = (mod.default ?? mod) as typeof import("qrcode");
      QRCode.toDataURL(url, { width: 320, margin: 2 }).then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  function copyLink() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!slug) {
    return (
      <InlineMessage variant="warning">
        Imposta il tuo codice Amway per generare il link contatti.
      </InlineMessage>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        Link fisso da condividere: chi lo apre compila un mini-form e diventa un tuo contatto in automatico.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url || ""}
          className="w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none"
        />
        <button
          onClick={copyLink}
          className="px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all shrink-0"
        >
          {copied ? "Copiato!" : "Copia"}
        </button>
      </div>
      {qrDataUrl && (
        <div className="flex flex-col items-center gap-2 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR contatti" className="w-40 h-40 rounded-xl border border-border" />
          <a
            href={qrDataUrl}
            download="weshare-qr-contatti.png"
            className="flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            <Download size={14} strokeWidth={2} />
            Scarica PNG
          </a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verifica**

Run: `npm run build`
Expected: nessun errore TypeScript (i tipi di `qrcode` arrivano da `@types/qrcode`).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/prospects/contact-qr-card.tsx
git commit -m "feat(contatti): componente ContactQrCard con QR self-hosted"
```

---

## Task 7: Pagina pubblica `/contatto/[slug]`

**Files:**
- Create: `src/app/contatto/[slug]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/sponsor/[slug]` (esistente, ritorna `{ sponsor: { nome, qualifica, ... } }`); `POST /api/contatto/[slug]` da Task 3; `sanitizeSlug()`.
- Produces: rotta pubblica che genera il prospect e redirige a `/anteprima/[token]`.

- [ ] **Step 1: Scrivi la pagina**

```tsx
// src/app/contatto/[slug]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { sanitizeSlug } from "@/lib/auth/slug";
import { InlineMessage } from "@/components/ui/inline-message";

interface Sponsor {
  nome: string;
  qualifica: string;
}

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export default function ContattoLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const cleanSlug = sanitizeSlug(slug);

  const [loading, setLoading] = useState(true);
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ nome: "", cognome: "", telefono: "", email: "", website: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!cleanSlug) {
      setError("Link non valido");
      setLoading(false);
      return;
    }
    fetch(`/api/sponsor/${encodeURIComponent(cleanSlug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.sponsor) {
          setSponsor({ nome: data.sponsor.nome, qualifica: data.sponsor.qualifica });
        } else {
          setError("Link non valido. Verifica di aver scansionato il codice corretto.");
        }
      })
      .catch(() => setError("Errore di caricamento. Riprova tra poco."))
      .finally(() => setLoading(false));
  }, [cleanSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || (!form.telefono.trim() && !form.email.trim())) {
      setSubmitError("Inserisci il nome e almeno un contatto (telefono o email)");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    const res = await fetch(`/api/contatto/${encodeURIComponent(cleanSlug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok && data.url) {
      router.push(data.url);
    } else {
      setSubmitError(data.error || "Errore durante l'invio, riprova.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !sponsor) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-main px-4">
        <div className="w-full max-w-md text-center bg-bg-card border border-border rounded-2xl p-8">
          <h1 className="text-lg font-bold text-text-primary mb-2">Link non valido</h1>
          <p className="text-sm text-text-secondary">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-bg-main px-4 py-10 overflow-y-auto">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-text-primary">WeShare</h1>
          <p className="text-sm text-text-gentle mt-1">powered by Me.To.Do for you®</p>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-accent-glow to-coral-soft p-6 text-center border-b border-divider">
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-2">Sei stato invitato da</p>
            <div className="text-lg font-bold text-text-primary">{sponsor.nome}</div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-3">
            <h2 className="text-base font-semibold text-text-primary mb-1">Lascia i tuoi contatti</h2>
            <p className="text-sm text-text-secondary mb-3">
              Compila il form per ricevere eventi e contenuti selezionati per te.
            </p>
            {submitError && <InlineMessage variant="error">{submitError}</InlineMessage>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="text" placeholder="Nome *" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required className={inputClass} />
              <input type="text" placeholder="Cognome" value={form.cognome} onChange={(e) => setForm({ ...form, cognome: e.target.value })} className={inputClass} />
              <input type="tel" placeholder="Telefono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={inputClass} />
              <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
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
            <button type="submit" disabled={submitting} className="w-full py-3 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
              {submitting ? "Invio..." : "Invia"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica**

Run: `npm run build`
Expected: nessun errore.

- [ ] **Step 3: Verifica manuale end-to-end**

Con `npm run dev` attivo, apri `http://localhost:3000/contatto/8044484` (o lo slug reale del partner test) in sessione incognita:
1. Verifica che compaia "Sei stato invitato da SETTEN ALESSANDRO" (o il nome del partner test).
2. Compila nome + telefono, invia.
3. Expected: redirect automatico a `/anteprima/<token>` con la vetrina (eventi/contenuti/CTA WhatsApp).
4. Verifica in `/contatti` (loggato come quel partner) che il contatto compaia con provenienza "QR / Link contatti".
5. Prova a inviare con uno slug inventato (`/contatto/xxxnonexiste`) → expected "Link non valido".

- [ ] **Step 4: Commit**

```bash
git add src/app/contatto/\[slug\]/page.tsx
git commit -m "feat(contatti): landing pubblica /contatto/[slug] con form acquisizione"
```

---

## Task 8: Bottone "My QrCode" in `/contatti`

**Files:**
- Modify: `src/app/api/profile/route.ts:6` (aggiunge `invite_url_slug` a `PROFILE_FIELDS`)
- Modify: `src/app/(dashboard)/contatti/page.tsx`

**Interfaces:**
- Consumes: `<ContactQrCard slug={string | null} />` da Task 6; `GET /api/profile` (ora con `invite_url_slug`).

- [ ] **Step 1: Esponi `invite_url_slug` da `/api/profile`**

In `src/app/api/profile/route.ts`, sostituisci:

```ts
const PROFILE_FIELDS =
  "id, nome, email, telefono, indirizzo, cap, citta, codice_amway, codice_attivita, qualifica, data_ingresso, platino_riferimento_id, diamante_riferimento_id, preferenze_notifiche, avatar_url";
```

con:

```ts
const PROFILE_FIELDS =
  "id, nome, email, telefono, indirizzo, cap, citta, codice_amway, codice_attivita, qualifica, data_ingresso, platino_riferimento_id, diamante_riferimento_id, preferenze_notifiche, avatar_url, invite_url_slug";
```

- [ ] **Step 2: Aggiungi bottone + modal in `/contatti`**

In `src/app/(dashboard)/contatti/page.tsx`:

Aggiungi import in cima:

```ts
import { QrCode } from "lucide-react";
import { ContactQrCard } from "@/components/prospects/contact-qr-card";
```

Aggiungi stato, subito dopo `const [formData, setFormData] = useState({...})`:

```ts
  const [mySlug, setMySlug] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
```

Aggiungi il fetch dello slug nell'`useEffect` esistente:

```ts
  useEffect(() => {
    fetchProspects();
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => setMySlug(d.profile?.invite_url_slug || d.profile?.codice_amway || null))
      .catch(() => {});
  }, []);
```

Aggiungi il bottone accanto a "+ Nuovo Contatto" (dentro il `<div className="flex items-center gap-2">`, subito prima del bottone `+ Nuovo Contatto`):

```tsx
          <button
            onClick={() => setShowQr(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all"
          >
            <QrCode size={16} strokeWidth={2} />
            My QrCode
          </button>
```

Aggiungi il modal, subito prima della chiusura del componente (dopo il blocco `{filtered.length === 0 && (...)}`, prima di `</div>` finale):

```tsx
      {showQr && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
          <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md shadow-xl mb-8">
            <div className="flex items-center justify-between p-5 border-b border-divider">
              <h3 className="text-lg font-bold text-text-primary">My QrCode</h3>
              <button onClick={() => setShowQr(false)} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
            </div>
            <div className="p-5">
              <ContactQrCard slug={mySlug} />
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 3: Verifica**

Run: `npm run build`
Expected: nessun errore.

- [ ] **Step 4: Verifica manuale**

In `/contatti`, click su "My QrCode" → expected modal con link `/contatto/<tuo-slug>` e QR renderizzato. Click "Copia" → link negli appunti. Click "Scarica PNG" → file scaricato.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/profile/route.ts "src/app/(dashboard)/contatti/page.tsx"
git commit -m "feat(contatti): bottone My QrCode con link fisso acquisizione contatti"
```

---

## Task 9: Sezione QR in `/impostazioni`

**Files:**
- Modify: `src/app/(dashboard)/impostazioni/page.tsx`

**Interfaces:**
- Consumes: `<ContactQrCard slug={string | null} />` da Task 6; `invite_url_slug` già esposto da `/api/profile` (Task 8).

- [ ] **Step 1: Aggiungi il campo al tipo `Profile` e importa il componente**

Import in cima:

```ts
import { ContactQrCard } from "@/components/prospects/contact-qr-card";
```

Nell'interfaccia `Profile`, aggiungi:

```ts
interface Profile {
  id: string;
  nome: string;
  email: string;
  telefono: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  codice_amway: string | null;
  codice_attivita: string | null;
  qualifica: string | null;
  data_ingresso: string | null;
  platino_riferimento_id: string | null;
  diamante_riferimento_id: string | null;
  preferenze_notifiche: Record<string, boolean>;
  avatar_url: string | null;
  invite_url_slug: string | null;
}
```

- [ ] **Step 2: Aggiungi la sezione UI**

Subito dopo la sezione "Profilo Amway" (dopo il suo `</div>` di chiusura, prima di "Notifiche email"), aggiungi:

```tsx
      {/* My QrCode */}
      <div className={cardClass}>
        <h2 className="font-semibold text-text-primary">My QrCode</h2>
        <ContactQrCard slug={profile.invite_url_slug || profile.codice_amway} />
      </div>
```

- [ ] **Step 3: Verifica**

Run: `npm run build`
Expected: nessun errore.

- [ ] **Step 4: Verifica manuale**

In `/impostazioni`, verifica che compaia la sezione "My QrCode" con lo stesso link/QR mostrato in `/contatti`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/impostazioni/page.tsx"
git commit -m "feat(impostazioni): sezione My QrCode inline nel profilo"
```

---

## Task 10: Riutilizzo dati — prefill su `/registrati`

**Files:**
- Modify: `src/components/prospects/convert-modal.tsx`
- Modify: `src/app/invite/[slug]/page.tsx`
- Modify: `src/app/registrati/page.tsx`

**Interfaces:**
- Consumes: `GET /api/prospects/public/[id]` da Task 4.

- [ ] **Step 1: `convert-modal.tsx` — aggiungi `prospect` al link generato**

Sostituisci:

```ts
      const slug = d.inviteSlug;
      setInviteUrl(slug ? `${window.location.origin}/invite/${slug}` : null);
```

con:

```ts
      const slug = d.inviteSlug;
      setInviteUrl(slug ? `${window.location.origin}/invite/${slug}?prospect=${prospect.id}` : null);
```

- [ ] **Step 2: `invite/[slug]/page.tsx` — inoltra `prospect` verso `/registrati`**

Sostituisci:

```tsx
            <button
              onClick={() =>
                router.push(`/registrati?sponsor=${encodeURIComponent(sponsor.slug)}`)
              }
```

con:

```tsx
            <button
              onClick={() => {
                const prospectId = new URLSearchParams(window.location.search).get("prospect");
                const qp = new URLSearchParams({ sponsor: sponsor.slug });
                if (prospectId) qp.set("prospect", prospectId);
                router.push(`/registrati?${qp.toString()}`);
              }}
```

- [ ] **Step 3: `registrati/page.tsx` — leggi `prospect` e precompila**

Subito dopo la riga:

```ts
  const sponsorSlug = sanitizeSlug(search.get("sponsor") || "");
```

aggiungi:

```ts
  const prospectId = search.get("prospect");
```

Aggiungi un nuovo `useEffect` (dopo quello che carica lo sponsor):

```ts
  useEffect(() => {
    if (!prospectId) return;
    fetch(`/api/prospects/public/${encodeURIComponent(prospectId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.prospect) return;
        const parts = (data.prospect.nome || "").trim().split(/\s+/);
        setForm((f) => ({
          ...f,
          nome: f.nome || parts[0] || "",
          cognome: f.cognome || parts.slice(1).join(" "),
          telefono: f.telefono || data.prospect.telefono || "",
          email: f.email || data.prospect.email || "",
        }));
      })
      .catch(() => {});
  }, [prospectId]);
```

- [ ] **Step 4: Verifica**

Run: `npm run build`
Expected: nessun errore.

- [ ] **Step 5: Verifica manuale end-to-end**

1. In `/contatti/[id]` di un prospect di test, click "Converti" → "A Partner".
2. Copia il link generato, verifica che contenga `?prospect=<id>`.
3. Aprilo in sessione incognita → `/invite/[slug]?prospect=<id>`.
4. Click "Registrati ora" → verifica che l'URL diventi `/registrati?sponsor=...&prospect=<id>` e che nome/cognome/telefono/email siano già precompilati (modificabili).
5. Ripeti con un prospect già `convertito_a` non nullo → verifica che i campi restino vuoti (nessun prefill, endpoint ritorna `null`).

- [ ] **Step 6: Commit**

```bash
git add src/components/prospects/convert-modal.tsx "src/app/invite/[slug]/page.tsx" src/app/registrati/page.tsx
git commit -m "feat(registrati): prefill nome/telefono/email da prospect in conversione a partner"
```
