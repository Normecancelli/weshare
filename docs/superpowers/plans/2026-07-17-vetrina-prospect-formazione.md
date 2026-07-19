# Formazione/Presentazioni + Vetrina Prospect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire un sistema contenuti (Formazione/Presentazioni) per i partner e, sopra di esso, un link individuale tracciabile che permette a un prospect (senza account) di vedere una vetrina di eventi selezionati + contenuti formativi, con CTA WhatsApp verso il partner.

**Architecture:** Nuova tabella `contenuti` (CRUD gate platino+/admin, stesso pattern di `events`) servita da `/formazione` e `/presentazioni`; nuova tabella `prospect_preview_links` con token univoco per prospect (scadenza 30gg, upsert su rigenerazione); nuova route pubblica `/anteprima/[token]` aggiunta al middleware come path pubblico, con una API `GET /api/anteprima/[token]` che usa `createAdminClient()` per bypassare RLS e aggregare eventi (`visibile_prospect=true`, stessa logica di visibilità gruppo di `events_read`) + contenuti (`visibile_prospect=true`).

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS v4, Supabase (Postgres + Storage + RLS), nessun framework di test automatico nel progetto (verifica: `npm run build` per i type-error, verifica manuale in browser per il comportamento).

## Global Constraints

- Nessuna suite di test automatica in questo progetto — ogni task usa `npm run build` come gate meccanico (type-check) e chiude con una verifica manuale in browser dove applicabile.
- Le migration SQL **non vengono applicate automaticamente**: vanno mostrate come blocco di codice puro (mai incapsulate in `cat << EOF` via Bash) e applicate manualmente dall'utente via Supabase SQL Editor. Qualsiasi verifica sul DB dopo l'applicazione usa solo query `SELECT` di sola lettura (mai scritture di test).
- Ogni route autenticata: `supabase.auth.getUser()` prima di ogni logica; usare `createAdminClient()` solo dove serve bypassare RLS (letture cross-utente, route pubbliche), altrimenti il client SSR standard che rispetta le RLS policy.
- Role gate per creare/modificare contenuti: `canCreateEvent(ruolo, qualifica)` da `src/lib/auth/roles.ts` (già esistente, ammette `admin`/`topadmin` + qualifiche `platino`/`rubino`/`zaffiro`/`smeraldo`/`diamante`) — nessun nuovo helper.
- Italian locale ovunque: date con `.toLocaleDateString('it-IT')`/`.toLocaleString('it-IT')`.
- Icone funzionali: `lucide-react`, mai emoji (dove il progetto ha già usato emoji altrove è debito pregresso, non replicarlo in codice nuovo).
- Componenti interattivi: `"use client"` in cima, stesso stile Tailwind inline già in uso (`bg-bg-card border border-border rounded-2xl p-5`, `inputClass` pattern).
- Commit git: comandi separati (`git add`, poi `git commit`), mai concatenati con `&&`.

---

### Task 1: Migration DB — contenuti, visibile_prospect, prospect_preview_links, bucket storage

**Files:**
- Create: `supabase/migrations/015_contenuti_vetrina.sql`

**Interfaces:**
- Produces: tabella `contenuti` (id, tipo, titolo, descrizione, tema, media_tipo, url_esterno, file_path, visibile_prospect, creato_da, created_at, updated_at); colonna `events.visibile_prospect`; tabella `prospect_preview_links` (id, prospect_id UNIQUE, token UNIQUE, expires_at, view_count, last_viewed_at, created_at, updated_at); bucket storage `contenuti`.

- [ ] **Step 1: Scrivere la migration**

```sql
-- supabase/migrations/015_contenuti_vetrina.sql
-- Sistema contenuti Formazione/Presentazioni + vetrina prospect con link
-- individuale tracciabile. Spec: docs/superpowers/specs/2026-07-17-vetrina-prospect-formazione-design.md

CREATE TABLE public.contenuti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('formazione','presentazione')),
  titolo TEXT NOT NULL,
  descrizione TEXT,
  tema TEXT,
  media_tipo TEXT NOT NULL CHECK (media_tipo IN ('link_esterno','file')),
  url_esterno TEXT,
  file_path TEXT,
  visibile_prospect BOOLEAN NOT NULL DEFAULT FALSE,
  creato_da UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contenuti_tipo ON public.contenuti(tipo);
CREATE INDEX idx_contenuti_tema ON public.contenuti(tema);

ALTER TABLE public.contenuti ENABLE ROW LEVEL SECURITY;

CREATE POLICY contenuti_read ON public.contenuti FOR SELECT TO authenticated
  USING (true);

CREATE POLICY contenuti_insert ON public.contenuti FOR INSERT TO authenticated
  WITH CHECK (
    creato_da = auth.uid()
    AND (
      public.get_user_role() IN ('admin','topadmin')
      OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino','platino')
    )
  );

CREATE POLICY contenuti_update ON public.contenuti FOR UPDATE TO authenticated
  USING (
    creato_da = auth.uid()
    OR public.get_user_role() IN ('admin','topadmin')
  );

CREATE POLICY contenuti_delete ON public.contenuti FOR DELETE TO authenticated
  USING (
    creato_da = auth.uid()
    OR public.get_user_role() IN ('admin','topadmin')
  );

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'contenuti_updated_at'
  ) THEN
    CREATE TRIGGER contenuti_updated_at
      BEFORE UPDATE ON public.contenuti
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- Eventi visibili nella vetrina prospect (flag manuale, indipendente da visibilita)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS visibile_prospect BOOLEAN NOT NULL DEFAULT FALSE;

-- Link vetrina individuale per prospect (una riga attiva per prospect)
CREATE TABLE public.prospect_preview_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL UNIQUE REFERENCES public.prospects(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  view_count INT NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prospect_preview_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospect_preview_links_owner ON public.prospect_preview_links
  FOR ALL TO authenticated
  USING (prospect_id IN (SELECT id FROM public.prospects WHERE partner_id = auth.uid()))
  WITH CHECK (prospect_id IN (SELECT id FROM public.prospects WHERE partner_id = auth.uid()));

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'prospect_preview_links_updated_at'
  ) THEN
    CREATE TRIGGER prospect_preview_links_updated_at
      BEFORE UPDATE ON public.prospect_preview_links
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- Storage bucket contenuti (pubblico in lettura, upload gate applicativo in /api/contenuti/upload)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contenuti', 'contenuti', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "contenuti_bucket_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'contenuti');

CREATE POLICY "contenuti_bucket_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contenuti');

CREATE POLICY "contenuti_bucket_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'contenuti');
```

- [ ] **Step 2: Applicare manualmente**

Mostrare il contenuto del file all'utente come blocco di codice (mai via `cat << EOF` in Bash — l'utente copia ed esegue lui stesso in Supabase SQL Editor, dashboard progetto `ietxuhkkahnvcbchfspt`).

- [ ] **Step 3: Verificare (sola lettura)**

```bash
psql "$SUPABASE_DB_URL" -c "\d contenuti" -c "\d prospect_preview_links" -c "SELECT column_name FROM information_schema.columns WHERE table_name='events' AND column_name='visibile_prospect';"
```

Expected: le tre strutture esistono, `visibile_prospect` compare tra le colonne di `events`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/015_contenuti_vetrina.sql
```

```bash
git commit -m "feat(db): tabelle contenuti + prospect_preview_links, flag visibile_prospect su events"
```

---

### Task 2: Componente InlineMessage + tipi contenuti + helper embed

**Files:**
- Create: `src/components/ui/inline-message.tsx`
- Create: `src/lib/types/contenuti.ts`
- Create: `src/lib/contenuti/embed.ts`

**Interfaces:**
- Produces: `<InlineMessage variant="error"|"warning"|"success"|"info">children</InlineMessage>`; tipo `Contenuto`, `ContenutoTipo`, `ContenutoMediaTipo`, `TIPO_LABELS`; funzione `toEmbeddableUrl(url: string): string`.

- [ ] **Step 1: Creare `src/components/ui/inline-message.tsx`**

```tsx
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";

type Variant = "error" | "warning" | "success" | "info";

const VARIANT_STYLE: Record<Variant, { bg: string; text: string; icon: LucideIcon }> = {
  error: { bg: "bg-error/10", text: "text-error", icon: AlertCircle },
  warning: { bg: "bg-warning/10", text: "text-warning", icon: AlertTriangle },
  success: { bg: "bg-success/10", text: "text-success", icon: CheckCircle2 },
  info: { bg: "bg-info/10", text: "text-info", icon: Info },
};

type Props = {
  variant: Variant;
  children: React.ReactNode;
};

export function InlineMessage({ variant, children }: Props) {
  const { bg, text, icon: Icon } = VARIANT_STYLE[variant];
  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm ${bg} ${text}`}>
      <Icon size={16} strokeWidth={2} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
```

- [ ] **Step 2: Creare `src/lib/types/contenuti.ts`**

```ts
export type ContenutoTipo = "formazione" | "presentazione";
export type ContenutoMediaTipo = "link_esterno" | "file";

export interface Contenuto {
  id: string;
  tipo: ContenutoTipo;
  titolo: string;
  descrizione: string | null;
  tema: string | null;
  media_tipo: ContenutoMediaTipo;
  url_esterno: string | null;
  file_path: string | null;
  visibile_prospect: boolean;
  creato_da: string;
  created_at: string;
  updated_at: string;
  // aggiunto dall'API (non su DB): url pubblico risolto (storage o url_esterno)
  url: string;
}

export const TIPO_LABELS: Record<ContenutoTipo, string> = {
  formazione: "Formazione",
  presentazione: "Presentazione",
};

export const UPLOAD_LIMIT_MB: Record<ContenutoTipo, number> = {
  formazione: 50,
  presentazione: 15,
};
```

- [ ] **Step 3: Creare `src/lib/contenuti/embed.ts`**

```ts
// Converte un link esterno (YouTube/Drive) in URL embeddabile per iframe,
// così il player in-app non fa mai uscire l'utente dal dominio.
export function toEmbeddableUrl(url: string): string {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;

  return url;
}
```

- [ ] **Step 4: Verificare**

```bash
npm run build
```

Expected: build passa senza errori (i tre file non sono ancora importati da nessuna pagina, quindi nessun errore di riferimento mancante).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/inline-message.tsx src/lib/types/contenuti.ts src/lib/contenuti/embed.ts
```

```bash
git commit -m "feat(ui): componente InlineMessage + tipi e helper embed per contenuti"
```

---

### Task 3: API contenuti — lista, temi, creazione, modifica, eliminazione, upload

**Files:**
- Create: `src/app/api/contenuti/route.ts`
- Create: `src/app/api/contenuti/temi/route.ts`
- Create: `src/app/api/contenuti/[id]/route.ts`
- Create: `src/app/api/contenuti/upload/route.ts`

**Interfaces:**
- Consumes: `Contenuto`, `ContenutoTipo`, `UPLOAD_LIMIT_MB` da `src/lib/types/contenuti.ts` (Task 2); `canCreateEvent`, `getUserRoleAndQualifica`, `isAdminRole` da `src/lib/auth/roles.ts`; `createClient` da `src/lib/supabase/server.ts`; `createAdminClient` da `src/lib/supabase/admin.ts`.
- Produces: `GET /api/contenuti?tipo=&tema=` → `{ contenuti: Contenuto[] }`; `GET /api/contenuti/temi?tipo=` → `{ temi: string[] }`; `POST /api/contenuti` → `{ contenuto: Contenuto }`; `PATCH /api/contenuti/[id]`, `DELETE /api/contenuti/[id]`; `POST /api/contenuti/upload` (multipart, campi `file`+`tipo`) → `{ file_path: string, url: string }`.

- [ ] **Step 1: Creare `src/app/api/contenuti/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canCreateEvent } from "@/lib/auth/roles";
import type { ContenutoTipo, ContenutoMediaTipo } from "@/lib/types/contenuti";

function resolveUrl(row: { media_tipo: ContenutoMediaTipo; url_esterno: string | null; file_path: string | null }) {
  if (row.media_tipo === "link_esterno") return row.url_esterno || "";
  const admin = createAdminClient();
  const { data } = admin.storage.from("contenuti").getPublicUrl(row.file_path || "");
  return data.publicUrl;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const tipo = request.nextUrl.searchParams.get("tipo");
  const tema = request.nextUrl.searchParams.get("tema");

  let query = supabase.from("contenuti").select("*").order("created_at", { ascending: false });
  if (tipo) query = query.eq("tipo", tipo);
  if (tema) query = query.eq("tema", tema);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const contenuti = (data || []).map((row) => ({ ...row, url: resolveUrl(row) }));
  return NextResponse.json({ contenuti });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(createAdminClient(), user.id);
  if (!canCreateEvent(ruolo, qualifica)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      tipo, titolo, descrizione, tema, media_tipo,
      url_esterno, file_path, visibile_prospect,
    }: {
      tipo: ContenutoTipo; titolo: string; descrizione?: string; tema?: string;
      media_tipo: ContenutoMediaTipo; url_esterno?: string; file_path?: string;
      visibile_prospect?: boolean;
    } = body;

    if (!titolo?.trim()) return NextResponse.json({ error: "Il titolo è obbligatorio" }, { status: 400 });
    if (!["formazione", "presentazione"].includes(tipo)) {
      return NextResponse.json({ error: "Tipo non valido" }, { status: 400 });
    }
    if (media_tipo === "link_esterno" && !url_esterno?.trim()) {
      return NextResponse.json({ error: "URL esterno obbligatorio" }, { status: 400 });
    }
    if (media_tipo === "file" && !file_path?.trim()) {
      return NextResponse.json({ error: "File mancante — caricalo prima di salvare" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("contenuti")
      .insert({
        tipo,
        titolo: titolo.trim(),
        descrizione: descrizione?.trim() || null,
        tema: tema?.trim() || null,
        media_tipo,
        url_esterno: media_tipo === "link_esterno" ? url_esterno!.trim() : null,
        file_path: media_tipo === "file" ? file_path!.trim() : null,
        visibile_prospect: !!visibile_prospect,
        creato_da: user.id,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contenuto: { ...data, url: resolveUrl(data) } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}
```

- [ ] **Step 2: Creare `src/app/api/contenuti/temi/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const tipo = request.nextUrl.searchParams.get("tipo");
  let query = supabase.from("contenuti").select("tema").not("tema", "is", null);
  if (tipo) query = query.eq("tipo", tipo);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const temi = Array.from(new Set((data || []).map((r) => r.tema as string))).sort((a, b) =>
    a.localeCompare(b, "it")
  );
  return NextResponse.json({ temi });
}
```

- [ ] **Step 3: Creare `src/app/api/contenuti/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const EDITABLE_FIELDS = ["titolo", "descrizione", "tema", "media_tipo", "url_esterno", "file_path", "visibile_prospect"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in body) {
        const value = body[field];
        updates[field] = typeof value === "string" ? value.trim() || null : value;
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("contenuti")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contenuto: data });
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { data: existing } = await supabase
    .from("contenuti")
    .select("media_tipo, file_path")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("contenuti").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing?.media_tipo === "file" && existing.file_path) {
    await createAdminClient().storage.from("contenuti").remove([existing.file_path]);
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Creare `src/app/api/contenuti/upload/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canCreateEvent } from "@/lib/auth/roles";
import { UPLOAD_LIMIT_MB, type ContenutoTipo } from "@/lib/types/contenuti";

const ALLOWED_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(createAdminClient(), user.id);
  if (!canCreateEvent(ruolo, qualifica)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const tipo = formData.get("tipo") as ContenutoTipo | null;

  if (!file) return NextResponse.json({ error: "File mancante" }, { status: 400 });
  if (!tipo || !(tipo in UPLOAD_LIMIT_MB)) {
    return NextResponse.json({ error: "Tipo contenuto non valido" }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Formato non supportato (mp4/webm/pdf)" }, { status: 400 });

  const limitBytes = UPLOAD_LIMIT_MB[tipo] * 1024 * 1024;
  if (file.size > limitBytes) {
    return NextResponse.json(
      { error: `File troppo grande (max ${UPLOAD_LIMIT_MB[tipo]}MB per ${tipo})` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const path = `${crypto.randomUUID()}/file.${ext}`;
  const buffer = await file.arrayBuffer();

  const { error: uploadError } = await admin.storage
    .from("contenuti")
    .upload(path, buffer, { contentType: file.type });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from("contenuti").getPublicUrl(path);
  return NextResponse.json({ file_path: path, url: publicUrl });
}
```

- [ ] **Step 5: Verificare**

```bash
npm run build
```

Expected: build passa. Nessuna pagina importa ancora queste route (sono raggiungibili solo via fetch), quindi il comportamento runtime si verifica manualmente nel Task 4 una volta costruita la UI.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/contenuti
```

```bash
git commit -m "feat(api): CRUD contenuti, filtro temi, upload storage"
```

---

### Task 4: UI Formazione/Presentazioni — grid, player, form, pagine

**Files:**
- Create: `src/components/contenuti/content-player-modal.tsx`
- Create: `src/components/contenuti/contenuto-form-modal.tsx`
- Create: `src/components/contenuti/contenuti-grid.tsx`
- Create: `src/app/(dashboard)/formazione/page.tsx`
- Create: `src/app/(dashboard)/presentazioni/page.tsx`

**Interfaces:**
- Consumes: `Contenuto`, `ContenutoTipo`, `ContenutoMediaTipo`, `TIPO_LABELS`, `UPLOAD_LIMIT_MB` (Task 2); `toEmbeddableUrl` (Task 2); `InlineMessage` (Task 2); `canCreateEvent` (`src/lib/auth/roles.ts`); API `GET/POST /api/contenuti`, `GET /api/contenuti/temi`, `PATCH/DELETE /api/contenuti/[id]`, `POST /api/contenuti/upload` (Task 3).
- Produces: `<ContentPlayerModal contenuto={Contenuto} onClose={() => void} />`; `<ContenutoFormModal tipo={ContenutoTipo} contenuto={Contenuto | null} onSaved={() => void} onClose={() => void} />`; `<ContenutiGrid contenuti={Contenuto[]} temi={string[]} selectedTema={string} onTemaChange={(t: string) => void} onOpen={(c: Contenuto) => void} canManage={boolean} onEdit={(c: Contenuto) => void} onDelete={(c: Contenuto) => void} />`.

- [ ] **Step 1: Creare `src/components/contenuti/content-player-modal.tsx`**

```tsx
"use client";

import type { Contenuto } from "@/lib/types/contenuti";
import { toEmbeddableUrl } from "@/lib/contenuti/embed";
import { InlineMessage } from "@/components/ui/inline-message";

type Props = {
  contenuto: Contenuto;
  onClose: () => void;
};

export function ContentPlayerModal({ contenuto, onClose }: Props) {
  const hasSource = !!contenuto.url;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-divider">
          <h3 className="text-base font-bold text-text-primary truncate pr-2">{contenuto.titolo}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all shrink-0">✕</button>
        </div>
        <div className="aspect-video bg-black flex items-center justify-center">
          {!hasSource ? (
            <div className="p-6"><InlineMessage variant="error">Contenuto non disponibile, riprova più tardi.</InlineMessage></div>
          ) : contenuto.media_tipo === "file" ? (
            <video src={contenuto.url} controls className="w-full h-full" />
          ) : (
            <iframe src={toEmbeddableUrl(contenuto.url)} className="w-full h-full" allow="autoplay; encrypted-media" allowFullScreen />
          )}
        </div>
        {contenuto.descrizione && (
          <p className="p-4 text-sm text-text-secondary">{contenuto.descrizione}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Creare `src/components/contenuti/contenuto-form-modal.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Contenuto, ContenutoMediaTipo, ContenutoTipo } from "@/lib/types/contenuti";
import { UPLOAD_LIMIT_MB } from "@/lib/types/contenuti";
import { InlineMessage } from "@/components/ui/inline-message";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

type Props = {
  tipo: ContenutoTipo;
  contenuto: Contenuto | null;
  onSaved: () => void;
  onClose: () => void;
};

export function ContenutoFormModal({ tipo, contenuto, onSaved, onClose }: Props) {
  const isEdit = !!contenuto;
  const [titolo, setTitolo] = useState(contenuto?.titolo || "");
  const [descrizione, setDescrizione] = useState(contenuto?.descrizione || "");
  const [tema, setTema] = useState(contenuto?.tema || "");
  const [temiSuggeriti, setTemiSuggeriti] = useState<string[]>([]);
  const [mediaTipo, setMediaTipo] = useState<ContenutoMediaTipo>(contenuto?.media_tipo || "link_esterno");
  const [urlEsterno, setUrlEsterno] = useState(contenuto?.url_esterno || "");
  const [filePath, setFilePath] = useState(contenuto?.file_path || "");
  const [visibileProspect, setVisibileProspect] = useState(contenuto?.visibile_prospect || false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/contenuti/temi?tipo=${tipo}`)
      .then((r) => r.json())
      .then((d) => setTemiSuggeriti(d.temi || []))
      .catch(() => {});
  }, [tipo]);

  async function handleUpload(file: File) {
    setError("");
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("tipo", tipo);
    const res = await fetch("/api/contenuti/upload", { method: "POST", body: fd });
    const d = await res.json();
    if (res.ok) {
      setFilePath(d.file_path);
    } else {
      setError(d.error || "Errore durante il caricamento");
    }
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!titolo.trim()) { setError("Il titolo è obbligatorio"); return; }
    if (mediaTipo === "link_esterno" && !urlEsterno.trim()) { setError("Inserisci un URL"); return; }
    if (mediaTipo === "file" && !filePath) { setError("Carica un file prima di salvare"); return; }

    setSaving(true);
    const body = {
      tipo, titolo, descrizione, tema, media_tipo: mediaTipo,
      url_esterno: mediaTipo === "link_esterno" ? urlEsterno : null,
      file_path: mediaTipo === "file" ? filePath : null,
      visibile_prospect: visibileProspect,
    };
    const res = await fetch(isEdit ? `/api/contenuti/${contenuto!.id}` : "/api/contenuti", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      onSaved();
      onClose();
    } else {
      const d = await res.json();
      setError(d.error || "Errore durante il salvataggio");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-lg shadow-xl mb-8">
        <div className="flex items-center justify-between p-5 border-b border-divider">
          <h3 className="text-lg font-bold text-text-primary">{isEdit ? "Modifica contenuto" : "Nuovo contenuto"}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <InlineMessage variant="error">{error}</InlineMessage>}

          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Titolo *</label>
            <input type="text" value={titolo} onChange={(e) => setTitolo(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Descrizione</label>
            <textarea value={descrizione} onChange={(e) => setDescrizione(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
          </div>

          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Tema</label>
            <input
              type="text"
              list="temi-suggeriti"
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              placeholder="es. prodotto, business, evento..."
              className={inputClass}
            />
            <datalist id="temi-suggeriti">
              {temiSuggeriti.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => setMediaTipo("link_esterno")} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${mediaTipo === "link_esterno" ? "border-accent bg-accent-glow text-accent" : "border-border text-text-secondary"}`}>Link esterno</button>
            <button type="button" onClick={() => setMediaTipo("file")} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${mediaTipo === "file" ? "border-accent bg-accent-glow text-accent" : "border-border text-text-secondary"}`}>File</button>
          </div>

          {mediaTipo === "link_esterno" ? (
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">URL (YouTube, Drive, PDF pubblico)</label>
              <input type="url" value={urlEsterno} onChange={(e) => setUrlEsterno(e.target.value)} className={inputClass} placeholder="https://..." />
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">File (max {UPLOAD_LIMIT_MB[tipo]}MB)</label>
              {tipo === "presentazione" && (
                <p className="text-xs text-text-gentle mb-2">Preferisci un link Drive/YouTube per file pesanti.</p>
              )}
              <input
                type="file"
                accept="video/mp4,video/webm,application/pdf"
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                className="text-sm"
              />
              {uploading && <p className="text-xs text-text-secondary mt-1">Caricamento...</p>}
              {filePath && !uploading && <p className="text-xs text-success mt-1">File caricato ✓</p>}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-text-primary pt-2">
            <input type="checkbox" checked={visibileProspect} onChange={(e) => setVisibileProspect(e.target.checked)} />
            Visibile anche nella vetrina prospect
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-divider">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:bg-bg-section transition-all">Annulla</button>
            <button type="submit" disabled={saving || uploading} className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
              {saving ? "..." : "Salva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Creare `src/components/contenuti/contenuti-grid.tsx`**

```tsx
"use client";

import type { Contenuto } from "@/lib/types/contenuti";

type Props = {
  contenuti: Contenuto[];
  temi: string[];
  selectedTema: string;
  onTemaChange: (tema: string) => void;
  onOpen: (contenuto: Contenuto) => void;
  canManage: boolean;
  onEdit: (contenuto: Contenuto) => void;
  onDelete: (contenuto: Contenuto) => void;
};

export function ContenutiGrid({ contenuti, temi, selectedTema, onTemaChange, onOpen, canManage, onEdit, onDelete }: Props) {
  return (
    <div>
      {temi.length > 0 && (
        <select
          value={selectedTema}
          onChange={(e) => onTemaChange(e.target.value)}
          className="mb-4 px-3 py-2 rounded-xl text-sm border border-border bg-bg-main"
        >
          <option value="">Tutti i temi</option>
          {temi.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}

      {contenuti.length === 0 ? (
        <p className="text-sm text-text-secondary py-8 text-center">Nessun contenuto disponibile.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contenuti.map((c) => (
            <div key={c.id} className="bg-bg-card border border-border rounded-2xl p-4 flex flex-col">
              <button onClick={() => onOpen(c)} className="text-left flex-1">
                <p className="font-semibold text-sm text-text-primary mb-1">{c.titolo}</p>
                {c.descrizione && <p className="text-xs text-text-secondary line-clamp-2 mb-2">{c.descrizione}</p>}
                <div className="flex items-center gap-2 flex-wrap">
                  {c.tema && <span className="text-xs px-2 py-0.5 rounded-full bg-bg-section text-text-secondary">{c.tema}</span>}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent-glow text-accent">{c.media_tipo === "file" ? "File" : "Link"}</span>
                </div>
              </button>
              {canManage && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-divider">
                  <button onClick={() => onEdit(c)} className="text-xs font-semibold text-accent hover:opacity-70">Modifica</button>
                  <button onClick={() => onDelete(c)} className="text-xs font-semibold text-error hover:opacity-70">Elimina</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Creare `src/app/(dashboard)/formazione/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { GraduationCap, Plus } from "lucide-react";
import { canCreateEvent } from "@/lib/auth/roles";
import type { Contenuto } from "@/lib/types/contenuti";
import { ContenutiGrid } from "@/components/contenuti/contenuti-grid";
import { ContentPlayerModal } from "@/components/contenuti/content-player-modal";
import { ContenutoFormModal } from "@/components/contenuti/contenuto-form-modal";

export default function FormazionePage() {
  const [contenuti, setContenuti] = useState<Contenuto[]>([]);
  const [temi, setTemi] = useState<string[]>([]);
  const [selectedTema, setSelectedTema] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [playing, setPlaying] = useState<Contenuto | null>(null);
  const [editing, setEditing] = useState<Contenuto | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchAll = useCallback(async () => {
    const qs = selectedTema ? `?tipo=formazione&tema=${encodeURIComponent(selectedTema)}` : "?tipo=formazione";
    const [cRes, tRes] = await Promise.all([
      fetch(`/api/contenuti${qs}`),
      fetch("/api/contenuti/temi?tipo=formazione"),
    ]);
    setContenuti((await cRes.json()).contenuti || []);
    setTemi((await tRes.json()).temi || []);
  }, [selectedTema]);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setCanManage(canCreateEvent(d.ruolo, d.qualifica))).catch(() => {});
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleDelete(c: Contenuto) {
    if (!confirm(`Eliminare "${c.titolo}"?`)) return;
    await fetch(`/api/contenuti/${c.id}`, { method: "DELETE" });
    fetchAll();
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <GraduationCap size={22} strokeWidth={1.75} className="text-accent" />
          <h1 className="text-xl font-bold text-text-primary">Formazione</h1>
        </div>
        {canManage && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            <Plus size={16} strokeWidth={2} /> Nuovo contenuto
          </button>
        )}
      </div>

      <ContenutiGrid
        contenuti={contenuti}
        temi={temi}
        selectedTema={selectedTema}
        onTemaChange={setSelectedTema}
        onOpen={setPlaying}
        canManage={canManage}
        onEdit={(c) => { setEditing(c); setShowForm(true); }}
        onDelete={handleDelete}
      />

      {playing && <ContentPlayerModal contenuto={playing} onClose={() => setPlaying(null)} />}
      {showForm && (
        <ContenutoFormModal
          tipo="formazione"
          contenuto={editing}
          onSaved={fetchAll}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Creare `src/app/(dashboard)/presentazioni/page.tsx`**

Stessa struttura del Task 4 Step 4, con `tipo="presentazione"` al posto di `"formazione"`, icona `Presentation` al posto di `GraduationCap`, titolo "Presentazioni":

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Presentation, Plus } from "lucide-react";
import { canCreateEvent } from "@/lib/auth/roles";
import type { Contenuto } from "@/lib/types/contenuti";
import { ContenutiGrid } from "@/components/contenuti/contenuti-grid";
import { ContentPlayerModal } from "@/components/contenuti/content-player-modal";
import { ContenutoFormModal } from "@/components/contenuti/contenuto-form-modal";

export default function PresentazioniPage() {
  const [contenuti, setContenuti] = useState<Contenuto[]>([]);
  const [temi, setTemi] = useState<string[]>([]);
  const [selectedTema, setSelectedTema] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [playing, setPlaying] = useState<Contenuto | null>(null);
  const [editing, setEditing] = useState<Contenuto | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchAll = useCallback(async () => {
    const qs = selectedTema ? `?tipo=presentazione&tema=${encodeURIComponent(selectedTema)}` : "?tipo=presentazione";
    const [cRes, tRes] = await Promise.all([
      fetch(`/api/contenuti${qs}`),
      fetch("/api/contenuti/temi?tipo=presentazione"),
    ]);
    setContenuti((await cRes.json()).contenuti || []);
    setTemi((await tRes.json()).temi || []);
  }, [selectedTema]);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setCanManage(canCreateEvent(d.ruolo, d.qualifica))).catch(() => {});
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleDelete(c: Contenuto) {
    if (!confirm(`Eliminare "${c.titolo}"?`)) return;
    await fetch(`/api/contenuti/${c.id}`, { method: "DELETE" });
    fetchAll();
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Presentation size={22} strokeWidth={1.75} className="text-accent" />
          <h1 className="text-xl font-bold text-text-primary">Presentazioni</h1>
        </div>
        {canManage && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            <Plus size={16} strokeWidth={2} /> Nuovo contenuto
          </button>
        )}
      </div>

      <ContenutiGrid
        contenuti={contenuti}
        temi={temi}
        selectedTema={selectedTema}
        onTemaChange={setSelectedTema}
        onOpen={setPlaying}
        canManage={canManage}
        onEdit={(c) => { setEditing(c); setShowForm(true); }}
        onDelete={handleDelete}
      />

      {playing && <ContentPlayerModal contenuto={playing} onClose={() => setPlaying(null)} />}
      {showForm && (
        <ContenutoFormModal
          tipo="presentazione"
          contenuto={editing}
          onSaved={fetchAll}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected: passa senza errori di tipo.

- [ ] **Step 7: Verifica manuale in browser**

`npm run dev`, login come `alessandro@iseven.it` (admin/diamante — passa il gate `canCreateEvent`). Aprire `/formazione`: cliccare "+ Nuovo contenuto", creare un contenuto con media_tipo link_esterno (es. un URL YouTube) e un tema, salvare, verificare che compaia nella grid e che il filtro tema funzioni. Cliccare la card → il player si apre con l'iframe embed. Ripetere su `/presentazioni` con un file caricato (PDF piccolo) per verificare l'upload e il tag "File". Verificare che il bottone "Elimina" rimuova il contenuto. Infine, su `/presentazioni`, provare a caricare un file oltre 15MB e verificare che compaia l'`InlineMessage` di errore dimensione senza bloccare il resto del form.

- [ ] **Step 8: Commit**

```bash
git add src/components/contenuti src/app/\(dashboard\)/formazione src/app/\(dashboard\)/presentazioni
```

```bash
git commit -m "feat(formazione): pagine Formazione/Presentazioni con grid, filtro tema, player, CRUD"
```

---

### Task 5: Middleware pubblico + API generazione link vetrina prospect

**Files:**
- Modify: `src/lib/supabase/middleware.ts`
- Create: `src/app/api/prospects/[id]/preview-link/route.ts`

**Interfaces:**
- Consumes: `createClient` (`src/lib/supabase/server.ts`).
- Produces: `POST /api/prospects/[id]/preview-link` → `{ url: string, expiresAt: string }`; path `/anteprima` pubblico nel middleware.

- [ ] **Step 1: Modificare `src/lib/supabase/middleware.ts`**

In `src/lib/supabase/middleware.ts:37`, la condizione `isPublicPath` diventa:

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

- [ ] **Step 2: Creare `src/app/api/prospects/[id]/preview-link/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS).toISOString();

  const { data, error } = await supabase
    .from("prospect_preview_links")
    .upsert(
      { prospect_id: id, token, expires_at: expiresAt },
      { onConflict: "prospect_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origin = request.nextUrl.origin;
  return NextResponse.json({ url: `${origin}/anteprima/${data.token}`, expiresAt: data.expires_at });
}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: passa senza errori.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/middleware.ts src/app/api/prospects
```

```bash
git commit -m "feat(prospects): route pubblica /anteprima + API generazione link vetrina"
```

---

### Task 6: UI generazione link vetrina nella scheda prospect

**Files:**
- Create: `src/components/prospects/preview-link-modal.tsx`
- Modify: `src/app/(dashboard)/contatti/[id]/page.tsx`

**Interfaces:**
- Consumes: `Prospect` (`src/lib/types/prospects.ts`); `buildMailto`, `buildWhatsappUrl` (`src/lib/prospects/links.ts`); `POST /api/prospects/[id]/preview-link` (Task 5).
- Produces: `<PreviewLinkModal prospect={Prospect} onClose={() => void} />`.

- [ ] **Step 1: Creare `src/components/prospects/preview-link-modal.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { Prospect } from "@/lib/types/prospects";
import { buildMailto, buildWhatsappUrl } from "@/lib/prospects/links";
import { InlineMessage } from "@/components/ui/inline-message";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

type Props = {
  prospect: Prospect;
  onClose: () => void;
};

export function PreviewLinkModal({ prospect, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/prospects/${prospect.id}/preview-link`, { method: "POST" });
    const d = await res.json();
    if (res.ok) {
      setUrl(d.url);
    } else {
      setError(d.error || "Errore durante la generazione del link");
    }
    setLoading(false);
  }

  function copyLink() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const message = url
    ? `Ciao ${prospect.nome.split(" ")[0]}! Dai un'occhiata qui, ci sono i prossimi eventi e qualche contenuto utile: ${url}`
    : "";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md shadow-xl mb-8">
        <div className="flex items-center justify-between p-5 border-b border-divider">
          <h3 className="text-lg font-bold text-text-primary">Link vetrina per {prospect.nome}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <InlineMessage variant="error">{error}</InlineMessage>}

          {!url ? (
            <>
              <p className="text-sm text-text-secondary">Genera un link personale (valido 30 giorni) con eventi e contenuti selezionati da mostrare a {prospect.nome}.</p>
              <button onClick={generate} disabled={loading} className="w-full py-3 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
                {loading ? "Generazione..." : "Genera link"}
              </button>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <input readOnly value={url} className={inputClass} />
                <button onClick={copyLink} className="px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all shrink-0">
                  {copied ? "Copiato!" : "Copia"}
                </button>
              </div>
              <div className="flex gap-2">
                {prospect.email && (
                  <a href={buildMailto(prospect.email, "Dai un'occhiata qui", message)} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all">✉️ Email</a>
                )}
                {prospect.telefono && (
                  <a href={buildWhatsappUrl(prospect.telefono, message)} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-3 py-2 rounded-xl text-sm font-semibold bg-[#25D366] text-white hover:opacity-90 transition-all">WhatsApp</a>
                )}
              </div>
              <button onClick={generate} disabled={loading} className="text-xs text-text-secondary hover:text-accent transition-colors">
                Rigenera link (invalida quello precedente)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Modificare `src/app/(dashboard)/contatti/[id]/page.tsx`**

Aggiungere l'import (vicino agli altri import di componenti prospect, dopo `import { ConvertModal } ...`):

```ts
import { PreviewLinkModal } from "@/components/prospects/preview-link-modal";
```

Aggiungere lo state (vicino a `const [showConvert, setShowConvert] = useState(false);`):

```ts
  const [showPreviewLink, setShowPreviewLink] = useState(false);
```

Nel blocco header, subito prima della chiusura `</div>` che segue il bottone "Converti" (la `div` con `className="flex items-center justify-between gap-4 mb-6"`), aggiungere il nuovo bottone accanto a quello esistente — sostituire:

```tsx
        {prospect.convertito_a ? (
          <span className="text-xs font-semibold text-success">
            ✓ Convertito a {prospect.convertito_a}
          </span>
        ) : (
          <button onClick={() => setShowConvert(true)} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-success text-white hover:opacity-90 transition-all">
            Converti
          </button>
        )}
```

con:

```tsx
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPreviewLink(true)} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all">
            Link vetrina
          </button>
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

Infine, subito dopo il blocco `{showConvert && (...)}` in fondo al componente, aggiungere:

```tsx
      {showPreviewLink && (
        <PreviewLinkModal
          prospect={prospect}
          onClose={() => setShowPreviewLink(false)}
        />
      )}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: passa senza errori.

- [ ] **Step 4: Verifica manuale in browser**

Aprire un contatto in `/contatti/[id]`, cliccare "Link vetrina" → "Genera link", verificare che appaia l'URL, che "Copia" funzioni, e che i bottoni Email/WhatsApp aprano con il messaggio precompilato (solo se il prospect ha email/telefono impostati). Cliccare "Rigenera link" e verificare che l'URL cambi.

- [ ] **Step 5: Commit**

```bash
git add src/components/prospects/preview-link-modal.tsx "src/app/(dashboard)/contatti/[id]/page.tsx"
```

```bash
git commit -m "feat(prospects): bottone e modal per generare il link vetrina dalla scheda contatto"
```

---

### Task 7: API pubblica vetrina — `GET /api/anteprima/[token]`

**Files:**
- Create: `src/app/api/anteprima/[token]/route.ts`

**Interfaces:**
- Consumes: `createAdminClient` (`src/lib/supabase/admin.ts`).
- Produces: `GET /api/anteprima/[token]` → `200 { partnerNome: string, partnerTelefono: string | null, eventi: Evento[], contenuti: Contenuto[] }` | `404 { error }` | `410 { error }`.

- [ ] **Step 1: Creare `src/app/api/anteprima/[token]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("prospect_preview_links")
    .select("id, prospect_id, expires_at, view_count")
    .eq("token", token)
    .maybeSingle();

  if (!link) return NextResponse.json({ error: "Link non trovato" }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link scaduto" }, { status: 410 });
  }

  const { data: prospect } = await admin
    .from("prospects")
    .select("partner_id")
    .eq("id", link.prospect_id)
    .single();

  if (!prospect) return NextResponse.json({ error: "Link non trovato" }, { status: 404 });

  const { data: partner } = await admin
    .from("profiles")
    .select("nome, telefono, ruolo, qualifica, platino_riferimento_id")
    .eq("id", prospect.partner_id)
    .single();

  if (!partner) return NextResponse.json({ error: "Link non trovato" }, { status: 404 });

  const [{ data: eventiRaw }, { data: contenutiRaw }] = await Promise.all([
    admin.from("events").select("*").eq("visibile_prospect", true),
    admin.from("contenuti").select("*").eq("visibile_prospect", true),
  ]);

  // Replica in-handler la stessa logica di events_read (migration 014):
  // globale, o creato dal partner, o "gruppo" del platino di riferimento del
  // partner (o il partner stesso ha visibilità elevata).
  const highVisibility = ["admin", "topadmin"].includes(partner.ruolo || "") ||
    ["diamante", "smeraldo", "zaffiro", "rubino"].includes(partner.qualifica || "");

  const eventi = (eventiRaw || []).filter((e) =>
    e.visibilita === "globale" ||
    e.creato_da === prospect.partner_id ||
    (e.visibilita === "gruppo" && (e.platino_id === partner.platino_riferimento_id || highVisibility))
  );

  const contenuti = (contenutiRaw || []).map((c) => ({
    ...c,
    url: c.media_tipo === "link_esterno"
      ? c.url_esterno || ""
      : admin.storage.from("contenuti").getPublicUrl(c.file_path || "").data.publicUrl,
  }));

  // Fire-and-forget: aggiorna contatore visite senza bloccare la risposta.
  admin
    .from("prospect_preview_links")
    .update({ view_count: link.view_count + 1, last_viewed_at: new Date().toISOString() })
    .eq("id", link.id)
    .then(() => {});

  return NextResponse.json({
    partnerNome: partner.nome,
    partnerTelefono: partner.telefono,
    eventi,
    contenuti,
  });
}
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: passa senza errori.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/anteprima
```

```bash
git commit -m "feat(anteprima): API pubblica vetrina prospect con logica visibilita gruppo replicata"
```

---

### Task 8: Pagina pubblica `/anteprima/[token]`

**Files:**
- Create: `src/app/anteprima/[token]/page.tsx`

**Interfaces:**
- Consumes: `Contenuto` (`src/lib/types/contenuti.ts`); `ContenutiGrid`, `ContentPlayerModal` (Task 4); `Evento` (`src/lib/types/events.ts`); `InlineMessage` (Task 2); `buildWhatsappUrl` (`src/lib/prospects/links.ts`); `GET /api/anteprima/[token]` (Task 7).

- [ ] **Step 1: Creare `src/app/anteprima/[token]/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Calendar, MapPin } from "lucide-react";
import type { Evento } from "@/lib/types/events";
import type { Contenuto } from "@/lib/types/contenuti";
import { ContenutiGrid } from "@/components/contenuti/contenuti-grid";
import { ContentPlayerModal } from "@/components/contenuti/content-player-modal";
import { InlineMessage } from "@/components/ui/inline-message";
import { buildWhatsappUrl } from "@/lib/prospects/links";

interface VetrinaData {
  partnerNome: string;
  partnerTelefono: string | null;
  eventi: Evento[];
  contenuti: Contenuto[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AnteprimaPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<VetrinaData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedTema, setSelectedTema] = useState("");
  const [playing, setPlaying] = useState<Contenuto | null>(null);

  useEffect(() => {
    fetch(`/api/anteprima/${token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) { setError(d.error || "Link non valido"); return; }
        setData(d);
      })
      .catch(() => setError("Errore di caricamento. Riprova più tardi."))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-main px-4 min-h-screen">
        <div className="w-full max-w-md text-center bg-bg-card border border-border rounded-2xl p-8">
          <InlineMessage variant="warning">{error || "Link non più valido, contatta chi te l'ha inviato."}</InlineMessage>
        </div>
      </div>
    );
  }

  const temi = Array.from(new Set(data.contenuti.map((c) => c.tema).filter((t): t is string => !!t))).sort((a, b) => a.localeCompare(b, "it"));
  const contenutiFiltrati = selectedTema ? data.contenuti.filter((c) => c.tema === selectedTema) : data.contenuti;

  const waMessage = `Ciao ${data.partnerNome.split(" ")[0]}, ho visto la tua pagina e sono interessato!`;

  return (
    <div className="min-h-screen bg-bg-main pb-24">
      <div className="bg-gradient-to-br from-accent-glow to-coral-soft p-8 text-center border-b border-divider">
        <p className="text-xs uppercase tracking-wide text-text-secondary mb-2">Ti ha invitato</p>
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white text-xl font-bold mx-auto mb-3">
          {data.partnerNome.split(/\s+/).map((p) => p[0]?.toUpperCase() || "").join("").slice(0, 2)}
        </div>
        <div className="text-lg font-bold text-text-primary">{data.partnerNome}</div>
      </div>

      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-8">
        {data.eventi.length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-secondary mb-3">Prossimi eventi</h2>
            <div className="space-y-3">
              {data.eventi.map((e) => (
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
                </div>
              ))}
            </div>
          </section>
        )}

        {data.contenuti.length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-secondary mb-3">Formazione e presentazioni</h2>
            <ContenutiGrid
              contenuti={contenutiFiltrati}
              temi={temi}
              selectedTema={selectedTema}
              onTemaChange={setSelectedTema}
              onOpen={setPlaying}
              canManage={false}
              onEdit={() => {}}
              onDelete={() => {}}
            />
          </section>
        )}
      </div>

      {data.partnerTelefono && (
        <a
          href={buildWhatsappUrl(data.partnerTelefono, waMessage)}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-4 left-4 right-4 max-w-md mx-auto py-3.5 rounded-xl text-sm font-semibold bg-[#25D366] text-white text-center shadow-lg hover:opacity-90 transition-all"
        >
          Scrivimi su WhatsApp
        </a>
      )}

      {playing && <ContentPlayerModal contenuto={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: passa senza errori.

- [ ] **Step 3: Verifica manuale end-to-end in browser**

1. Come `alessandro@iseven.it`, marcare un evento esistente e un contenuto come `visibile_prospect` (via form modifica).
2. Dalla scheda di un prospect, generare il link vetrina.
3. Aprire il link in una finestra in incognito (nessuna sessione autenticata) → verificare che compaiano solo l'evento e il contenuto marcati, l'header mostri il nome del partner, il filtro tema funzioni, il player si apra correttamente, e il bottone WhatsApp in fondo apra `wa.me` con il numero del partner.
4. Modificare a mano `expires_at` nel passato per quel token via query SQL mostrata all'utente (sola lettura non applicabile qui — è uno UPDATE di test: farlo eseguire all'utente stesso nel SQL Editor, non via psql) e ricaricare la pagina → verificare che compaia il messaggio di link scaduto.

- [ ] **Step 4: Commit**

```bash
git add src/app/anteprima
```

```bash
git commit -m "feat(anteprima): pagina pubblica vetrina prospect con eventi, contenuti e CTA WhatsApp"
```
