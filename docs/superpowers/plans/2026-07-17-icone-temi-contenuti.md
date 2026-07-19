# Icone per tema (Formazione/Presentazioni) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assegnare un'icona `lucide-react` scelta da un set curato di 24 a ciascun **tema** (non al singolo contenuto) di Formazione/Presentazioni, tramite un picker manuale nel form contenuto, visibile poi sulle card contenuto sia lato partner sia nella vetrina pubblica prospect.

**Architecture:** Nuova tabella `temi_icone` (tema→icona, indipendente da `contenuti.tema` che resta testo libero non vincolato). `GET /api/contenuti/temi` e `GET /api/anteprima/[token]` vengono estesi per restituire `{ tema, icona }[]` invece di `string[]`; nuovo `PUT /api/contenuti/temi/[tema]` fa l'upsert. `ContenutiGrid` riceve il nuovo shape e mostra l'icona sulle card; `ContenutoFormModal` guadagna la griglia di selezione icona, chiamata prima del salvataggio del contenuto (due richieste sequenziali, non una transazione).

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS v4, Supabase (Postgres + RLS), `lucide-react`. Nessun framework di test automatico — gate: `npm run build` + verifica manuale in browser.

## Global Constraints

- Migration SQL numerata `016` (l'ultima applicata è `015_contenuti_vetrina.sql`), mostrata come blocco di codice puro all'utente (mai `cat << EOF` via Bash), applicata manualmente via Supabase SQL Editor — nessun agente la applica al DB.
- Set icone fisso e canonico in un solo punto (`ICONE_TEMA_DISPONIBILI`), mai duplicato come literal array altrove (né lato client né lato server) — sia la UI del picker sia la validazione server-side importano la stessa costante.
- Icona per tema, mai per singolo contenuto — nessun campo `icona` va aggiunto a `contenuti` o al tipo `Contenuto`.
- Permessi: `canCreateEvent(ruolo, qualifica)` da `src/lib/auth/roles.ts` per scrivere su `temi_icone` — stesso perimetro di chi gestisce contenuti oggi, nessun nuovo helper di ruolo.
- Icone: solo `lucide-react`, mai emoji.
- Ogni route autenticata: `supabase.auth.getUser()` prima di ogni logica; `createAdminClient()` solo per il bypass RLS già stabilito (`getUserRoleAndQualifica`), mai per query che l'RLS di `temi_icone`/`contenuti` già permette al client SSR.
- Italian locale, stesso stile Tailwind inline già in uso nel progetto (`bg-bg-card border border-border rounded-2xl`, `inputClass` pattern).
- Commit git: comandi `git add`/`git commit` separati, mai concatenati con `&&`.

---

### Task 1: Migration DB + libreria icone + componente icona condiviso

**Files:**
- Create: `supabase/migrations/016_temi_icone.sql`
- Create: `src/lib/contenuti/icone-temi.ts`
- Create: `src/components/contenuti/icona-tema-icon.tsx`
- Modify: `src/lib/types/contenuti.ts`

**Interfaces:**
- Produces: tabella `temi_icone` (tema PK, icona, created_at, updated_at); costante `ICONE_TEMA_DISPONIBILI: readonly string[]` (24 nomi icona lucide-react), tipo `IconaTema`, costante `ICONA_TEMA_DEFAULT: IconaTema`; componente `<IconaTemaIcon nome={string} size={number} className={string} />`; tipo `TemaIcona { tema: string; icona: string }` esportato da `src/lib/types/contenuti.ts`.

- [ ] **Step 1: Scrivere la migration**

```sql
-- supabase/migrations/016_temi_icone.sql
-- Icona lucide-react per tema (non per singolo contenuto). Spec:
-- docs/superpowers/specs/2026-07-17-icone-temi-contenuti-design.md

CREATE TABLE public.temi_icone (
  tema TEXT PRIMARY KEY,
  icona TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.temi_icone ENABLE ROW LEVEL SECURITY;

CREATE POLICY temi_icone_read ON public.temi_icone FOR SELECT TO authenticated
  USING (true);

CREATE POLICY temi_icone_write ON public.temi_icone FOR ALL TO authenticated
  USING (
    public.get_user_role() IN ('admin','topadmin')
    OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino','platino')
  )
  WITH CHECK (
    public.get_user_role() IN ('admin','topadmin')
    OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino','platino')
  );

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'temi_icone_updated_at'
  ) THEN
    CREATE TRIGGER temi_icone_updated_at
      BEFORE UPDATE ON public.temi_icone
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;
```

- [ ] **Step 2: Mostrare la SQL all'utente e verificare (sola lettura)**

Mostrare il contenuto del file come blocco di codice puro (mai `cat << EOF` via Bash). Dopo che l'utente conferma di averla applicata via Supabase SQL Editor:

```bash
psql "$SUPABASE_DB_URL" -c "\d temi_icone"
```

Expected: la tabella esiste con le colonne `tema`, `icona`, `created_at`, `updated_at`.

- [ ] **Step 3: Creare `src/lib/contenuti/icone-temi.ts`**

```ts
// Set curato di icone assegnabili a un tema (Formazione/Presentazioni).
// Unica fonte di verità: sia il picker UI sia la validazione server-side
// importano questa costante, mai una copia locale.
export const ICONE_TEMA_DISPONIBILI = [
  "GraduationCap", "Presentation", "Package", "Briefcase", "Calendar",
  "Users", "TrendingUp", "Star", "Target", "Heart", "Sparkles", "Home",
  "ShoppingCart", "Award", "Megaphone", "Handshake", "Lightbulb", "BookOpen",
  "Video", "Mic", "Globe", "DollarSign", "Rocket", "Leaf",
] as const;

export type IconaTema = (typeof ICONE_TEMA_DISPONIBILI)[number];

export const ICONA_TEMA_DEFAULT: IconaTema = "BookOpen";

export function isIconaTemaValida(value: string): value is IconaTema {
  return (ICONE_TEMA_DISPONIBILI as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Creare `src/components/contenuti/icona-tema-icon.tsx`**

```tsx
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ICONA_TEMA_DEFAULT } from "@/lib/contenuti/icone-temi";

type Props = {
  nome: string;
  size?: number;
  className?: string;
};

export function IconaTemaIcon({ nome, size = 16, className }: Props) {
  const IconComponent = ((Icons as unknown as Record<string, LucideIcon>)[nome]) ||
    (Icons as unknown as Record<string, LucideIcon>)[ICONA_TEMA_DEFAULT];
  return <IconComponent size={size} strokeWidth={1.75} className={className} />;
}
```

- [ ] **Step 5: Modificare `src/lib/types/contenuti.ts`**

Aggiungere in fondo al file (dopo `UPLOAD_LIMIT_MB`):

```ts
export interface TemaIcona {
  tema: string;
  icona: string;
}
```

- [ ] **Step 6: Verificare**

```bash
npm run build
```

Expected: build passa senza errori (i nuovi file non sono ancora importati da nessuna route/pagina).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/016_temi_icone.sql src/lib/contenuti/icone-temi.ts src/components/contenuti/icona-tema-icon.tsx src/lib/types/contenuti.ts
```

```bash
git commit -m "feat(db): tabella temi_icone + set icone curato + componente IconaTemaIcon"
```

---

### Task 2: API — upsert icona tema, estensione GET temi e GET anteprima

**Files:**
- Create: `src/app/api/contenuti/temi/[tema]/route.ts`
- Modify: `src/app/api/contenuti/temi/route.ts`
- Modify: `src/app/api/anteprima/[token]/route.ts`

**Interfaces:**
- Consumes: `ICONE_TEMA_DISPONIBILI`, `isIconaTemaValida`, `ICONA_TEMA_DEFAULT` (Task 1, `src/lib/contenuti/icone-temi.ts`); `TemaIcona` (Task 1, `src/lib/types/contenuti.ts`); `canCreateEvent`, `getUserRoleAndQualifica` (`src/lib/auth/roles.ts`); `createClient`, `createAdminClient`.
- Produces: `PUT /api/contenuti/temi/[tema]` (body `{ icona: string }`) → `{ temaIcona: TemaIcona }` | 400 | 401 | 403; `GET /api/contenuti/temi?tipo=` → `{ temi: TemaIcona[] }` (era `{ temi: string[] }`); `GET /api/anteprima/[token]` → aggiunge `temi: TemaIcona[]` al body esistente (`partnerNome`, `partnerTelefono`, `eventi`, `contenuti` invariati).

- [ ] **Step 1: Creare `src/app/api/contenuti/temi/[tema]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, canCreateEvent } from "@/lib/auth/roles";
import { isIconaTemaValida } from "@/lib/contenuti/icone-temi";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tema: string }> }
) {
  const supabase = await createClient();
  const { tema } = await params;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { ruolo, qualifica } = await getUserRoleAndQualifica(createAdminClient(), user.id);
  if (!canCreateEvent(ruolo, qualifica)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const decodedTema = decodeURIComponent(tema).trim();
  if (!decodedTema) return NextResponse.json({ error: "Tema mancante" }, { status: 400 });

  let body: { icona?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  if (!body.icona || !isIconaTemaValida(body.icona)) {
    return NextResponse.json({ error: "Icona non valida" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("temi_icone")
    .upsert({ tema: decodedTema, icona: body.icona }, { onConflict: "tema" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ temaIcona: data });
}
```

- [ ] **Step 2: Modificare `src/app/api/contenuti/temi/route.ts`**

Sostituire l'intero file con:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ICONA_TEMA_DEFAULT } from "@/lib/contenuti/icone-temi";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const tipo = request.nextUrl.searchParams.get("tipo");
  let query = supabase.from("contenuti").select("tema").not("tema", "is", null);
  if (tipo) query = query.eq("tipo", tipo);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const temiDistinti = Array.from(new Set((data || []).map((r) => r.tema as string))).sort((a, b) =>
    a.localeCompare(b, "it")
  );

  if (temiDistinti.length === 0) {
    return NextResponse.json({ temi: [] });
  }

  const { data: iconeRaw } = await supabase
    .from("temi_icone")
    .select("tema, icona")
    .in("tema", temiDistinti);

  const iconeMap = new Map((iconeRaw || []).map((r) => [r.tema, r.icona]));
  const temi = temiDistinti.map((t) => ({ tema: t, icona: iconeMap.get(t) || ICONA_TEMA_DEFAULT }));

  return NextResponse.json({ temi });
}
```

- [ ] **Step 3: Modificare `src/app/api/anteprima/[token]/route.ts`**

Dopo il blocco che costruisce `const contenuti = (contenutiRaw || []).map(...)` (prima del commento "Fire-and-forget"), aggiungere:

```ts
  const temiUsati = Array.from(
    new Set((contenutiRaw || []).map((c) => c.tema).filter((t): t is string => !!t))
  );
  let temi: { tema: string; icona: string }[] = [];
  if (temiUsati.length > 0) {
    const { data: iconeRaw } = await admin
      .from("temi_icone")
      .select("tema, icona")
      .in("tema", temiUsati);
    const iconeMap = new Map((iconeRaw || []).map((r) => [r.tema, r.icona]));
    temi = temiUsati
      .sort((a, b) => a.localeCompare(b, "it"))
      .map((t) => ({ tema: t, icona: iconeMap.get(t) || ICONA_TEMA_DEFAULT }));
  }
```

E aggiungere l'import in cima al file:

```ts
import { ICONA_TEMA_DEFAULT } from "@/lib/contenuti/icone-temi";
```

Infine, nel `return NextResponse.json({ ... })` finale, aggiungere `temi,` accanto a `eventi,`/`contenuti,`:

```ts
  return NextResponse.json({
    partnerNome: partner.nome,
    partnerTelefono: partner.telefono,
    eventi,
    contenuti,
    temi,
  });
```

- [ ] **Step 4: Verificare**

```bash
npm run build
```

Expected: build passa senza errori. Queste route non sono ancora consumate dal nuovo shape lato UI (Task 3), quindi il comportamento runtime si verifica lì.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/contenuti/temi/[tema]/route.ts" src/app/api/contenuti/temi/route.ts "src/app/api/anteprima/[token]/route.ts"
```

```bash
git commit -m "feat(api): upsert icona tema, GET temi e GET anteprima estesi con icona"
```

---

### Task 3: UI — picker icona nel form, resa icona su grid e vetrina pubblica

**Files:**
- Modify: `src/components/contenuti/contenuti-grid.tsx`
- Modify: `src/components/contenuti/contenuto-form-modal.tsx`
- Modify: `src/app/(dashboard)/formazione/page.tsx`
- Modify: `src/app/(dashboard)/presentazioni/page.tsx`
- Modify: `src/app/anteprima/[token]/page.tsx`

**Interfaces:**
- Consumes: `TemaIcona` (`src/lib/types/contenuti.ts`, Task 1); `IconaTemaIcon` (Task 1); `ICONE_TEMA_DISPONIBILI`, `IconaTema` (Task 1); `GET /api/contenuti/temi` → `{ temi: TemaIcona[] }`, `PUT /api/contenuti/temi/[tema]` (Task 2); `GET /api/anteprima/[token]` → ora include `temi: TemaIcona[]` (Task 2).
- Produces: `ContenutiGrid` prop `temi` cambia tipo da `string[]` a `TemaIcona[]` (breaking change, tutti i 3 chiamanti in questo stesso task vengono aggiornati insieme).

- [ ] **Step 1: Modificare `src/components/contenuti/contenuti-grid.tsx`**

Sostituire l'intero file con:

```tsx
"use client";

import type { Contenuto, TemaIcona } from "@/lib/types/contenuti";
import { IconaTemaIcon } from "@/components/contenuti/icona-tema-icon";

type Props = {
  contenuti: Contenuto[];
  temi: TemaIcona[];
  selectedTema: string;
  onTemaChange: (tema: string) => void;
  onOpen: (contenuto: Contenuto) => void;
  canManage: boolean;
  onEdit: (contenuto: Contenuto) => void;
  onDelete: (contenuto: Contenuto) => void;
};

export function ContenutiGrid({ contenuti, temi, selectedTema, onTemaChange, onOpen, canManage, onEdit, onDelete }: Props) {
  const iconaPerTema = new Map(temi.map((t) => [t.tema, t.icona]));

  return (
    <div>
      {temi.length > 0 && (
        <select
          value={selectedTema}
          onChange={(e) => onTemaChange(e.target.value)}
          className="mb-4 px-3 py-2 rounded-xl text-sm border border-border bg-bg-main"
        >
          <option value="">Tutti i temi</option>
          {temi.map((t) => <option key={t.tema} value={t.tema}>{t.tema}</option>)}
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
                  {c.tema && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-bg-section text-text-secondary">
                      <IconaTemaIcon nome={iconaPerTema.get(c.tema) || ""} size={12} />
                      {c.tema}
                    </span>
                  )}
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

- [ ] **Step 2: Modificare `src/components/contenuti/contenuto-form-modal.tsx`**

Sostituire l'intero file con:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Contenuto, ContenutoMediaTipo, ContenutoTipo, TemaIcona } from "@/lib/types/contenuti";
import { UPLOAD_LIMIT_MB } from "@/lib/types/contenuti";
import { InlineMessage } from "@/components/ui/inline-message";
import { ICONE_TEMA_DISPONIBILI, type IconaTema } from "@/lib/contenuti/icone-temi";
import { IconaTemaIcon } from "@/components/contenuti/icona-tema-icon";

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
  const [temiSuggeriti, setTemiSuggeriti] = useState<TemaIcona[]>([]);
  const [icona, setIcona] = useState<IconaTema | null>(null);
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

  useEffect(() => {
    const match = temiSuggeriti.find((t) => t.tema === tema.trim());
    if (match) setIcona(match.icona as IconaTema);
  }, [tema, temiSuggeriti]);

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
    if (tema.trim() && !icona) { setError("Scegli un'icona per il tema"); return; }

    setSaving(true);

    if (tema.trim() && icona) {
      const iconRes = await fetch(`/api/contenuti/temi/${encodeURIComponent(tema.trim())}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icona }),
      });
      if (!iconRes.ok) {
        const d = await iconRes.json();
        setError(d.error || "Errore durante il salvataggio dell'icona tema");
        setSaving(false);
        return;
      }
    }

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
              {temiSuggeriti.map((t) => <option key={t.tema} value={t.tema} />)}
            </datalist>
          </div>

          {tema.trim() && (
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Icona tema *</label>
              <div className="grid grid-cols-6 gap-2">
                {ICONE_TEMA_DISPONIBILI.map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setIcona(n)}
                    className={`aspect-square rounded-xl border flex items-center justify-center transition-all ${icona === n ? "border-accent bg-accent-glow text-accent" : "border-border text-text-secondary hover:border-accent/50"}`}
                  >
                    <IconaTemaIcon nome={n} size={18} />
                  </button>
                ))}
              </div>
            </div>
          )}

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

- [ ] **Step 3: Modificare `src/app/(dashboard)/formazione/page.tsx`**

Sostituire questa riga:

```ts
  const [temi, setTemi] = useState<string[]>([]);
```

con:

```ts
  const [temi, setTemi] = useState<TemaIcona[]>([]);
```

E aggiungere l'import di `TemaIcona` accanto all'import esistente di `Contenuto`:

```ts
import type { Contenuto, TemaIcona } from "@/lib/types/contenuti";
```

(rimuovendo la riga `import type { Contenuto } from "@/lib/types/contenuti";` esistente, sostituita da quella sopra). Nessun'altra modifica al file — il resto del codice (`fetchAll`, il rendering di `<ContenutiGrid temi={temi} .../>`) resta identico, perché consuma `temi` solo passandolo a `ContenutiGrid` senza assumerne la forma interna.

- [ ] **Step 4: Modificare `src/app/(dashboard)/presentazioni/page.tsx`**

Stessa identica modifica del Step 3, applicata a questo file (import `TemaIcona`, tipo dello state `temi`).

- [ ] **Step 5: Modificare `src/app/anteprima/[token]/page.tsx`**

Sostituire:

```ts
import type { Evento } from "@/lib/types/events";
import type { Contenuto } from "@/lib/types/contenuti";
```

con:

```ts
import type { Evento } from "@/lib/types/events";
import type { Contenuto, TemaIcona } from "@/lib/types/contenuti";
```

Sostituire l'interfaccia:

```ts
interface VetrinaData {
  partnerNome: string;
  partnerTelefono: string | null;
  eventi: Evento[];
  contenuti: Contenuto[];
}
```

con:

```ts
interface VetrinaData {
  partnerNome: string;
  partnerTelefono: string | null;
  eventi: Evento[];
  contenuti: Contenuto[];
  temi: TemaIcona[];
}
```

Rimuovere questa riga (il calcolo locale dei temi non serve più, arriva già pronto dall'API):

```ts
  const temi = Array.from(new Set(data.contenuti.map((c) => c.tema).filter((t): t is string => !!t))).sort((a, b) => a.localeCompare(b, "it"));
```

E nel JSX, dove `<ContenutiGrid temi={temi} .../>` viene renderizzato, sostituire `temi={temi}` con `temi={data.temi}`.

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected: passa senza errori di tipo.

- [ ] **Step 7: Verifica manuale in browser**

`npm run dev`, login `alessandro@iseven.it`. Su `/formazione`: creare un contenuto con un tema nuovo → verificare che il salvataggio sia bloccato finché non si sceglie un'icona dalla griglia (provare a submittare senza sceglierla, verificare l'`InlineMessage` di errore). Scegliere un'icona, salvare → verificare che la card mostri l'icona nel badge tema. Creare un secondo contenuto con lo STESSO tema → verificare che il form pre-selezioni automaticamente l'icona già assegnata. Cambiare l'icona di quel tema dal secondo contenuto, salvare, poi ricaricare la pagina → verificare che ANCHE il primo contenuto mostri ora la nuova icona (icona condivisa per tema, non per contenuto). Generare un link vetrina da un prospect con quel contenuto marcato `visibile_prospect`, aprirlo in incognito → verificare che l'icona compaia anche lì.

- [ ] **Step 8: Commit**

```bash
git add src/components/contenuti/contenuti-grid.tsx src/components/contenuti/contenuto-form-modal.tsx "src/app/(dashboard)/formazione/page.tsx" "src/app/(dashboard)/presentazioni/page.tsx" "src/app/anteprima/[token]/page.tsx"
```

```bash
git commit -m "feat(contenuti): picker icona tema nel form, resa icona su card e vetrina pubblica"
```
