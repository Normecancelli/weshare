# Pagina Impostazioni + Chiave AI personale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire la pagina `/impostazioni` (foto profilo, dati personali, profilo Amway, notifiche email, chiave AI personale, account) e collegare un limite di 5 generazioni gratuite a vita sulla feature "Genera con AI" eventi, superate le quali serve la chiave Anthropic personale dell'utente.

**Architecture:** Migration `012_impostazioni.sql` aggiunge le colonne mancanti a `profiles` (verificate contro lo schema reale, non contro i file migration locali che risultano disallineati — vedi spec). Un bucket storage `avatars` replica il pattern già in produzione di `event-covers`. Endpoint `GET/PATCH /api/profile` e `POST/DELETE /api/profile/avatar` seguono lo stesso scheletro di auth+admin-client già usato in tutto il progetto. Un helper condiviso `getAiUsage()`/`getAiGenerationsRemaining()` centralizza la logica del limite, usata sia da `/api/auth/me` (per nascondere il pulsante AI nel form) sia da `/api/events/generate-description` (per applicare il limite server-side).

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (Postgres + Storage + Auth), Tailwind CSS v4.

## Global Constraints

- Nessun pagamento, nessun piano a pagamento — il limite di 5 generazioni gratuite a vita è l'unico meccanismo, e serve solo a far inserire all'utente la propria chiave personale.
- `anthropic_api_key` salvata in chiaro nella colonna `profiles.anthropic_api_key`, mai restituita dal client (solo booleano `hasAnthropicKey`), letta solo via `createAdminClient()` — decisione esplicita dell'utente, nessuna cifratura applicativa.
- Migration numerata `012` (non `006`): verificato che `002`-`011` sono già usate/applicate; lo schema reale di `profiles` (verificato via query diretta, non via file locali) NON ha `foto_url`, `codice_attivita`, `diamante_riferimento_id` nonostante `002_ordini_clienti.sql` li dichiari — quel file è disallineato dal DB reale. Ha invece già `avatar_url` e `preferenze_notifiche`, da riusare senza ricrearli.
- **Nessun framework di test automatico nel progetto** — verifica manuale via `tsc --noEmit` + dev server + browser, stessa convenzione di tutte le sessioni precedenti.
- **La migration 012 modifica lo schema del database di produzione** (stesso progetto Supabase usato dall'app live `weshare.growset.it`). Non va applicata senza conferma esplicita dell'utente nella sessione di esecuzione — è un'azione difficile da invertire su infrastruttura condivisa.
- Pattern di autenticazione uguale ovunque: `supabase.auth.getUser()` per identificare l'utente, poi `createAdminClient()` per leggere/scrivere `profiles` (bypassa RLS, evita la ricorsione nota — vedi `getUserRole()` in `src/lib/auth/roles.ts`).

---

## Task 1: Migration `012_impostazioni.sql` + bucket storage `avatars`

**Files:**
- Create: `supabase/migrations/012_impostazioni.sql`

**Interfaces:**
- Produces: colonne `profiles.cap`, `profiles.codice_attivita`, `profiles.diamante_riferimento_id`, `profiles.anthropic_api_key`, `profiles.ai_generations_count`; bucket storage `avatars` con relative policy. Consumato da tutti i task successivi.

- [ ] **Step 1: Scrivi il file di migration**

```sql
-- 012_impostazioni.sql
-- Colonne mancanti per la pagina /impostazioni (verificate contro lo schema
-- reale di produzione: avatar_url e preferenze_notifiche esistono già,
-- nonostante lo spec 2026-06-13 in CLAUDE.md assumesse il contrario).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cap TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS codice_attivita TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS diamante_riferimento_id UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_generations_count INT NOT NULL DEFAULT 0;

-- Bucket storage avatar (pubblico, upload ristretto al proprietario)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "avatars_owner_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_owner_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_owner_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: FERMATI e chiedi conferma esplicita all'utente prima di applicare**

Questa migration tocca il database di produzione condiviso. Mostra il contenuto del file all'utente e chiedi esplicitamente: "Applico questa migration al DB di produzione Supabase adesso?" Non procedere allo Step 3 senza un sì esplicito nella sessione corrente.

- [ ] **Step 3: Applica la migration (solo dopo conferma)**

Se l'utente ha accesso a Supabase Dashboard → SQL Editor: incollare e eseguire il contenuto del file lì è il modo più diretto (nessun tool locale in questo ambiente ha una connessione Postgres diretta funzionante — `psql` fallisce per risoluzione DNS nel sandbox). In alternativa, se il tool `mcp__plugin_supabase_supabase__*` è autenticato in sessione, usare `apply_migration` con lo stesso contenuto SQL.

- [ ] **Step 4: Verifica che la migration sia stata applicata**

Query di sola lettura per confermare le nuove colonne (via script Node temporaneo con `@supabase/supabase-js` e `SUPABASE_SERVICE_ROLE_KEY`, eseguito dalla root del progetto così risolve `node_modules`, poi cancellato — stesso approccio già usato in questa sessione per ispezionare lo schema):

```javascript
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from("profiles").select("*").limit(1);
console.log(error ? error : Object.keys(data[0] || {}));
```

Expected: l'array di colonne include `cap`, `codice_attivita`, `diamante_riferimento_id`, `anthropic_api_key`, `ai_generations_count`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/012_impostazioni.sql
git commit -m "feat(impostazioni): migration colonne profilo + bucket avatars"
```

---

## Task 2: Helper limite AI + estensione `GET /api/auth/me`

**Files:**
- Create: `src/lib/auth/ai-limit.ts`
- Modify: `src/app/api/auth/me/route.ts`

**Interfaces:**
- Produces:
  ```typescript
  export const AI_FREE_GENERATIONS_LIMIT = 5;
  export function getAiGenerationsRemaining(hasPersonalKey: boolean, generationsCount: number): number | null
  export async function getAiUsage(supabase: SupabaseClient, userId: string): Promise<{
    hasPersonalKey: boolean;
    generationsCount: number;
    anthropicApiKey: string | null;
  }>
  ```
  Consumato da: Task 3 (`GET /api/profile`), Task 7 (`generate-description`), e da questo stesso task per `/api/auth/me`.
- Consumes: `createAdminClient()` (già esistente).

- [ ] **Step 1: Scrivi l'helper**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export const AI_FREE_GENERATIONS_LIMIT = 5;

export function getAiGenerationsRemaining(
  hasPersonalKey: boolean,
  generationsCount: number,
): number | null {
  if (hasPersonalKey) return null;
  return Math.max(0, AI_FREE_GENERATIONS_LIMIT - generationsCount);
}

export async function getAiUsage(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  hasPersonalKey: boolean;
  generationsCount: number;
  anthropicApiKey: string | null;
}> {
  const { data } = await supabase
    .from("profiles")
    .select("anthropic_api_key, ai_generations_count")
    .eq("id", userId)
    .single();

  return {
    hasPersonalKey: !!data?.anthropic_api_key,
    generationsCount: data?.ai_generations_count ?? 0,
    anthropicApiKey: data?.anthropic_api_key ?? null,
  };
}
```

- [ ] **Step 2: Estendi `GET /api/auth/me`**

Sostituisci l'intero contenuto di `src/app/api/auth/me/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoleAndQualifica, isAdminRole } from "@/lib/auth/roles";
import { getAiUsage, getAiGenerationsRemaining } from "@/lib/auth/ai-limit";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      user: null,
      role: null,
      ruolo: null,
      qualifica: null,
      isAdmin: false,
      aiGenerationsRemaining: 0,
    });
  }

  const adminClient = createAdminClient();
  const { ruolo, qualifica } = await getUserRoleAndQualifica(adminClient, user.id);
  const { hasPersonalKey, generationsCount } = await getAiUsage(adminClient, user.id);

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    role: ruolo,
    ruolo,
    qualifica,
    isAdmin: isAdminRole(ruolo),
    aiGenerationsRemaining: getAiGenerationsRemaining(hasPersonalKey, generationsCount),
  });
}
```

- [ ] **Step 3: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/ai-limit.ts src/app/api/auth/me/route.ts
git commit -m "feat(impostazioni): helper limite generazioni AI + estende /api/auth/me"
```

---

## Task 3: `GET`/`PATCH /api/profile`

**Files:**
- Create: `src/app/api/profile/route.ts`

**Interfaces:**
- Consumes: `getAiUsage`, `getAiGenerationsRemaining` (Task 2).
- Produces:
  - `GET` risponde con `{ profile: {...}, hasAnthropicKey: boolean, aiGenerationsRemaining: number | null }`.
  - `PATCH` accetta body parziale, aggiorna `profiles`. Consumato dal Task 9/10/11 (pagina Impostazioni).

- [ ] **Step 1: Scrivi l'endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiUsage, getAiGenerationsRemaining } from "@/lib/auth/ai-limit";

const PROFILE_FIELDS =
  "id, nome, email, telefono, indirizzo, cap, citta, codice_amway, codice_attivita, qualifica, data_ingresso, platino_riferimento_id, diamante_riferimento_id, preferenze_notifiche, avatar_url";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Profilo non trovato" }, { status: 404 });
  }

  const { hasPersonalKey, generationsCount } = await getAiUsage(admin, user.id);

  return NextResponse.json({
    profile,
    hasAnthropicKey: hasPersonalKey,
    aiGenerationsRemaining: getAiGenerationsRemaining(hasPersonalKey, generationsCount),
  });
}

interface PatchBody {
  nome?: string;
  telefono?: string | null;
  indirizzo?: string | null;
  cap?: string | null;
  citta?: string | null;
  codice_attivita?: string | null;
  qualifica?: string | null;
  data_ingresso?: string | null;
  platino_riferimento_id?: string | null;
  diamante_riferimento_id?: string | null;
  preferenze_notifiche?: Record<string, boolean>;
  anthropic_api_key?: string | null;
}

const PATCHABLE_KEYS: (keyof PatchBody)[] = [
  "nome",
  "telefono",
  "indirizzo",
  "cap",
  "citta",
  "codice_attivita",
  "qualifica",
  "data_ingresso",
  "platino_riferimento_id",
  "diamante_riferimento_id",
  "preferenze_notifiche",
  "anthropic_api_key",
];

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const key of PATCHABLE_KEYS) {
    if (key in body) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 });
  }

  if ("anthropic_api_key" in update && typeof update.anthropic_api_key === "string" && !update.anthropic_api_key.trim()) {
    update.anthropic_api_key = null;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update(update).eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 3: Verifica manuale con curl (richiede login nel browser per il cookie di sessione — vedi Task 9 Step finale per il test end-to-end completo)**

Per ora verifica solo che senza sessione risponda coerentemente con gli altri endpoint (redirect/401 gestito dal middleware, stesso comportamento osservato per `parse-whatsapp` e `generate-description` in sessione precedente).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/profile/route.ts
git commit -m "feat(impostazioni): endpoint GET/PATCH /api/profile"
```

---

## Task 4: Upload/rimozione avatar

**Files:**
- Create: `src/app/api/profile/avatar/route.ts`

**Interfaces:**
- Consumes: nessuna interfaccia interna nuova, replica il pattern di `src/app/api/events/[id]/cover/route.ts`.
- Produces: `POST` risponde `{ avatar_url: string }`; `DELETE` risponde `{ ok: true }`. Consumato dal Task 10.

- [ ] **Step 1: Scrivi l'endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "File mancante" }, { status: 400 });
  }

  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Formato non supportato (jpeg/png/webp)" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File troppo grande (max 5MB)" }, { status: 400 });
  }

  const admin = createAdminClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/avatar.${ext}`;

  await admin.storage
    .from("avatars")
    .remove([`${user.id}/avatar.jpg`, `${user.id}/avatar.png`, `${user.id}/avatar.webp`]);

  const buffer = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("avatars").getPublicUrl(path);

  const { error: updateError } = await admin
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ avatar_url: publicUrl });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const admin = createAdminClient();
  await admin.storage
    .from("avatars")
    .remove([`${user.id}/avatar.jpg`, `${user.id}/avatar.png`, `${user.id}/avatar.webp`]);

  await admin.from("profiles").update({ avatar_url: null }).eq("id", user.id);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 3: Commit**

```bash
git add src/app/api/profile/avatar/route.ts
git commit -m "feat(impostazioni): endpoint upload/rimozione avatar"
```

---

## Task 5: Estendi `/api/profiles/platino-search` per il filtro diamante

**Files:**
- Modify: `src/app/api/profiles/platino-search/route.ts`

**Interfaces:**
- Produces: aggiunge query param opzionale `?solo=diamante` (se assente, comportamento invariato: platino/smeraldo/diamante). Consumato dal Task 9 per l'autocomplete "Diamante di riferimento".

- [ ] **Step 1: Modifica l'endpoint**

Sostituisci il contenuto di `src/app/api/profiles/platino-search/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Cerca profili con qualifica platino o superiore (smeraldo / diamante),
// oppure solo diamante se ?solo=diamante è passato (usato dall'autocomplete
// "Diamante di riferimento" in Impostazioni).
// Pubblico — usato anche nel form di registrazione. Ritorna SOLO campi
// sicuri (id, nome, codice, qualifica). No email, no telefono.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const solo = request.nextUrl.searchParams.get("solo");
  const supabase = createAdminClient();

  const qualifiche = solo === "diamante" ? ["diamante"] : ["platino", "smeraldo", "diamante"];

  let query = supabase
    .from("profiles")
    .select("id, codice_amway, nome, qualifica")
    .in("qualifica", qualifiche)
    .order("nome")
    .limit(20);

  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    const pattern = `%${tokens.join("%")}%`;
    query = query.or(
      `nome.ilike.${pattern},codice_amway.ilike.${pattern}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ platini: data || [] });
}
```

- [ ] **Step 2: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 3: Verifica manuale**

```bash
curl -s "http://localhost:3000/api/profiles/platino-search?solo=diamante" | python3 -m json.tool
```

Expected: solo profili con `qualifica: "diamante"` nell'array `platini`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/profiles/platino-search/route.ts
git commit -m "feat(impostazioni): filtro solo=diamante su platino-search"
```

---

## Task 6: Componente `<Avatar>`

**Files:**
- Create: `src/components/avatar.tsx`

**Interfaces:**
- Produces:
  ```typescript
  interface AvatarProps {
    profile: { avatar_url?: string | null; nome?: string | null };
    size?: "sm" | "md" | "lg";
  }
  export function Avatar(props: AvatarProps): JSX.Element
  ```
  Consumato dal Task 10 (sezione foto profilo). Non viene retrofittato in sidebar/team/altre pagine in questo piano (fuori scope, vedi spec).

- [ ] **Step 1: Scrivi il componente**

```tsx
const SIZE_CLASSES = {
  sm: "w-8 h-8 text-xs",
  md: "w-12 h-12 text-sm",
  lg: "w-24 h-24 text-2xl",
};

function initials(nome?: string | null): string {
  if (!nome) return "?";
  const parts = nome.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

interface AvatarProps {
  profile: { avatar_url?: string | null; nome?: string | null };
  size?: "sm" | "md" | "lg";
}

export function Avatar({ profile, size = "md" }: AvatarProps) {
  const sizeClass = SIZE_CLASSES[size];

  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.nome || "Avatar"}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-accent-glow text-accent font-semibold flex items-center justify-center shrink-0`}
    >
      {initials(profile.nome)}
    </div>
  );
}
```

- [ ] **Step 2: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 3: Commit**

```bash
git add src/components/avatar.tsx
git commit -m "feat(impostazioni): componente Avatar riusabile"
```

---

## Task 7: Limite + chiave personale in `generate-description`

**Files:**
- Modify: `src/app/api/events/generate-description/route.ts`

**Interfaces:**
- Consumes: `getAiUsage` (Task 2).
- Produces: comportamento esteso dell'endpoint esistente (nessuna modifica al contratto per il chiamante in caso di successo; nuovo status 403 per limite superato).

- [ ] **Step 1: Modifica l'endpoint**

In `src/app/api/events/generate-description/route.ts`, sostituisci il blocco import in cima al file:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
```

con:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiUsage, AI_FREE_GENERATIONS_LIMIT } from "@/lib/auth/ai-limit";
```

Poi sostituisci questo blocco esistente (subito dopo il check `if (!user) { ... }`):

```typescript
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Configurazione AI mancante. Contatta l'amministratore (ANTHROPIC_API_KEY non impostata).",
      },
      { status: 500 },
    );
  }
```

con:

```typescript
  const admin = createAdminClient();
  const { hasPersonalKey, generationsCount, anthropicApiKey } = await getAiUsage(admin, user.id);

  let apiKey: string;
  if (hasPersonalKey && anthropicApiKey) {
    apiKey = anthropicApiKey;
  } else {
    if (generationsCount >= AI_FREE_GENERATIONS_LIMIT) {
      return NextResponse.json(
        {
          error:
            "Hai esaurito le 5 generazioni gratuite. Aggiungi la tua chiave Anthropic personale in Impostazioni per continuare.",
        },
        { status: 403 },
      );
    }
    const globalKey = process.env.ANTHROPIC_API_KEY;
    if (!globalKey) {
      return NextResponse.json(
        {
          error:
            "Configurazione AI mancante. Contatta l'amministratore (ANTHROPIC_API_KEY non impostata).",
        },
        { status: 500 },
      );
    }
    apiKey = globalKey;
  }
```

Il resto della funzione (validazione `idea`, costruzione `contestoText`, definizione `tool`, `systemPrompt`, `const anthropic = new Anthropic({ apiKey });`, chiamata `anthropic.messages.create`, gestione errori) resta **invariato** — `apiKey` è già definita dal blocco sostituito sopra, quindi la riga esistente `const anthropic = new Anthropic({ apiKey });` continua a funzionare senza modifiche.

Infine, subito prima del `return NextResponse.json({ varianti: toolUseInput.varianti });` finale, aggiungi l'incremento del contatore (solo se non è stata usata la chiave personale):

```typescript
  if (!hasPersonalKey) {
    await admin
      .from("profiles")
      .update({ ai_generations_count: generationsCount + 1 })
      .eq("id", user.id);
  }

  return NextResponse.json({ varianti: toolUseInput.varianti });
```

`admin` è la stessa variabile creata con `createAdminClient()` all'inizio del blocco sostituito nello Step 1 — `supabase` (client SSR) resta usato solo per `auth.getUser()`.

- [ ] **Step 2: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 3: Verifica manuale nel browser**

Con la chiave personale NON impostata e `ai_generations_count` a 0 (stato attuale dopo la migration): generare un evento con AI, verificare che funzioni e che dopo la chiamata `ai_generations_count` sia incrementato a 1 (controllare con lo stesso script Node di sola lettura del Task 1 Step 4, selezionando `ai_generations_count` invece di `*`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/events/generate-description/route.ts
git commit -m "feat(eventi): limite 5 generazioni gratuite + chiave AI personale"
```

---

## Task 8: `event-form.tsx` — nascondi il pulsante AI oltre il limite

**Files:**
- Modify: `src/components/eventi/event-form.tsx`

**Interfaces:**
- Consumes: `GET /api/auth/me` esteso (Task 2), campo `aiGenerationsRemaining: number | null`.

- [ ] **Step 1: Aggiungi lo stato e il fetch**

Subito dopo la riga `const [showAiModal, setShowAiModal] = useState(false);`, aggiungi:

```typescript
  const [aiGenerationsRemaining, setAiGenerationsRemaining] = useState<number | null>(5);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setAiGenerationsRemaining(d.aiGenerationsRemaining ?? 0))
      .catch(() => {});
  }, []);
```

- [ ] **Step 2: Rendi condizionale il pulsante**

Sostituisci:

```tsx
      {/* AI genera titolo+descrizione */}
      <div>
        <button
          type="button"
          onClick={() => setShowAiModal(true)}
          className="flex items-center gap-2 text-sm font-medium text-accent hover:underline"
        >
          <Sparkles size={14} strokeWidth={1.75} />
          Genera con AI
        </button>
      </div>
```

con:

```tsx
      {/* AI genera titolo+descrizione */}
      {(aiGenerationsRemaining === null || aiGenerationsRemaining > 0) && (
        <div>
          <button
            type="button"
            onClick={() => setShowAiModal(true)}
            className="flex items-center gap-2 text-sm font-medium text-accent hover:underline"
          >
            <Sparkles size={14} strokeWidth={1.75} />
            Genera con AI
          </button>
        </div>
      )}
```

- [ ] **Step 3: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 4: Commit**

```bash
git add src/components/eventi/event-form.tsx
git commit -m "feat(eventi): nasconde pulsante Genera con AI oltre il limite gratuito"
```

---

## Task 9: Pagina Impostazioni — dati personali, profilo Amway, notifiche

**Files:**
- Create: `src/app/(dashboard)/impostazioni/page.tsx`

**Interfaces:**
- Consumes: `GET/PATCH /api/profile` (Task 3), `/api/profiles/platino-search` e `/api/profiles/platino-search?solo=diamante` (Task 5).
- Produces: la pagina `/impostazioni` (shell completa in questo task; Task 10 e 11 aggiungono sezioni allo stesso file).

- [ ] **Step 1: Scrivi la pagina (sezioni Dati personali, Profilo Amway, Notifiche)**

```tsx
"use client";

import { useEffect, useState, useRef } from "react";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const labelClass = "block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1";
const cardClass = "bg-bg-card rounded-2xl border border-divider p-5 space-y-4";

const QUALIFICHE = [
  { value: "nessuna", label: "Nuovo iscritto" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "platino", label: "Platino" },
  { value: "smeraldo", label: "Smeraldo" },
  { value: "diamante", label: "Diamante" },
];

interface RiferimentoProfilo {
  id: string;
  codice_amway: string | null;
  nome: string;
  qualifica: string;
}

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
}

function useRiferimentoAutocomplete(soloD: boolean) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RiferimentoProfilo[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      const url = `/api/profiles/platino-search?${soloD ? "solo=diamante&" : ""}q=${encodeURIComponent(query.trim())}`;
      const res = await fetch(url);
      const data = await res.json();
      setResults(data.platini || []);
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open, soloD]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return { query, setQuery, results, open, setOpen, ref };
}

export default function ImpostazioniPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [form, setForm] = useState({
    nome: "",
    telefono: "",
    indirizzo: "",
    cap: "",
    citta: "",
    codice_attivita: "",
    qualifica: "nessuna",
    data_ingresso: "",
    platino_riferimento_id: "",
    diamante_riferimento_id: "",
    preferenze_notifiche: {
      reminder_eventi: true,
      riepilogo_settimanale: true,
      date_clienti: true,
    } as Record<string, boolean>,
  });

  const [platinoNome, setPlatinoNome] = useState("");
  const [diamanteNome, setDiamanteNome] = useState("");
  const platinoAc = useRiferimentoAutocomplete(false);
  const diamanteAc = useRiferimentoAutocomplete(true);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        const p: Profile = d.profile;
        setProfile(p);
        setForm({
          nome: p.nome || "",
          telefono: p.telefono || "",
          indirizzo: p.indirizzo || "",
          cap: p.cap || "",
          citta: p.citta || "",
          codice_attivita: p.codice_attivita || "",
          qualifica: p.qualifica || "nessuna",
          data_ingresso: p.data_ingresso ? p.data_ingresso.slice(0, 10) : "",
          platino_riferimento_id: p.platino_riferimento_id || "",
          diamante_riferimento_id: p.diamante_riferimento_id || "",
          preferenze_notifiche: p.preferenze_notifiche || {
            reminder_eventi: true,
            riepilogo_settimanale: true,
            date_clienti: true,
          },
        });
        setLoading(false);
      });
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleNotifica(key: string) {
    setForm((f) => ({
      ...f,
      preferenze_notifiche: { ...f.preferenze_notifiche, [key]: !f.preferenze_notifiche[key] },
    }));
  }

  async function handleSalva() {
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: form.nome,
        telefono: form.telefono || null,
        indirizzo: form.indirizzo || null,
        cap: form.cap || null,
        citta: form.citta || null,
        codice_attivita: form.codice_attivita || null,
        qualifica: form.qualifica,
        data_ingresso: form.data_ingresso || null,
        platino_riferimento_id: form.platino_riferimento_id || null,
        diamante_riferimento_id: form.diamante_riferimento_id || null,
        preferenze_notifiche: form.preferenze_notifiche,
      }),
    });
    setSaving(false);
    showToast(res.ok ? "Modifiche salvate" : "Errore durante il salvataggio");
  }

  if (loading || !profile) {
    return <div className="p-6 text-text-secondary text-sm">Caricamento…</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#0B2545] text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <h1 className="text-xl font-bold text-text-primary">Impostazioni</h1>

      {/* Dati personali */}
      <div className={cardClass}>
        <h2 className="font-semibold text-text-primary">Dati personali</h2>
        <div>
          <label className={labelClass}>Nome e cognome</label>
          <input className={inputClass} value={form.nome} onChange={(e) => set("nome", e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Cellulare</label>
          <input className={inputClass} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Indirizzo</label>
            <input className={inputClass} value={form.indirizzo} onChange={(e) => set("indirizzo", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>CAP</label>
            <input className={inputClass} value={form.cap} onChange={(e) => set("cap", e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Città</label>
          <input className={inputClass} value={form.citta} onChange={(e) => set("citta", e.target.value)} />
        </div>
      </div>

      {/* Profilo Amway */}
      <div className={cardClass}>
        <h2 className="font-semibold text-text-primary">Profilo Amway</h2>
        <div>
          <label className={labelClass}>Codice Amway</label>
          <input className={`${inputClass} opacity-60`} value={profile.codice_amway || "—"} disabled />
        </div>
        <div>
          <label className={labelClass}>Codice attività</label>
          <input className={inputClass} value={form.codice_attivita} onChange={(e) => set("codice_attivita", e.target.value)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Qualifica</label>
            <select className={inputClass} value={form.qualifica} onChange={(e) => set("qualifica", e.target.value)}>
              {QUALIFICHE.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Data ingresso</label>
            <input type="date" className={inputClass} value={form.data_ingresso} onChange={(e) => set("data_ingresso", e.target.value)} />
          </div>
        </div>

        <div ref={platinoAc.ref} className="relative">
          <label className={labelClass}>Platino di riferimento</label>
          <input
            className={inputClass}
            placeholder="Cerca per nome o codice…"
            value={platinoAc.open ? platinoAc.query : platinoNome}
            onFocus={() => platinoAc.setOpen(true)}
            onChange={(e) => { platinoAc.setQuery(e.target.value); platinoAc.setOpen(true); }}
          />
          {platinoAc.open && platinoAc.results.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-auto">
              {platinoAc.results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm hover:bg-bg-section"
                  onClick={() => {
                    set("platino_riferimento_id", p.id);
                    setPlatinoNome(p.nome);
                    platinoAc.setOpen(false);
                  }}
                >
                  {p.nome} {p.codice_amway ? `(${p.codice_amway})` : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={diamanteAc.ref} className="relative">
          <label className={labelClass}>Diamante di riferimento</label>
          <input
            className={inputClass}
            placeholder="Cerca per nome o codice…"
            value={diamanteAc.open ? diamanteAc.query : diamanteNome}
            onFocus={() => diamanteAc.setOpen(true)}
            onChange={(e) => { diamanteAc.setQuery(e.target.value); diamanteAc.setOpen(true); }}
          />
          {diamanteAc.open && diamanteAc.results.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-auto">
              {diamanteAc.results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm hover:bg-bg-section"
                  onClick={() => {
                    set("diamante_riferimento_id", p.id);
                    setDiamanteNome(p.nome);
                    diamanteAc.setOpen(false);
                  }}
                >
                  {p.nome} {p.codice_amway ? `(${p.codice_amway})` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notifiche email */}
      <div className={cardClass}>
        <h2 className="font-semibold text-text-primary">Notifiche email</h2>
        {[
          { key: "reminder_eventi", label: "Reminder eventi 72h e 24h prima" },
          { key: "riepilogo_settimanale", label: "Riepilogo settimanale" },
          { key: "date_clienti", label: "Compleanni / date da ricordare clienti" },
        ].map((n) => (
          <label key={n.key} className="flex items-center gap-2 cursor-pointer text-sm text-text-primary">
            <input
              type="checkbox"
              className="accent-accent"
              checked={!!form.preferenze_notifiche[n.key]}
              onChange={() => toggleNotifica(n.key)}
            />
            {n.label}
          </label>
        ))}
      </div>

      <button
        onClick={handleSalva}
        disabled={saving}
        className="bg-accent hover:bg-accent-hover text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
      >
        {saving ? "Salvataggio…" : "Salva modifiche"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/impostazioni/page.tsx"
git commit -m "feat(impostazioni): pagina con dati personali, profilo Amway, notifiche"
```

---

## Task 10: Sezione Foto profilo

**Files:**
- Modify: `src/app/(dashboard)/impostazioni/page.tsx`

**Interfaces:**
- Consumes: `<Avatar>` (Task 6), `POST/DELETE /api/profile/avatar` (Task 4).

- [ ] **Step 1: Aggiungi import e stato**

Aggiungi in cima al file (dopo `import { useEffect, useState, useRef } from "react";`):

```typescript
import { Upload } from "lucide-react";
import { Avatar } from "@/components/avatar";
```

Dentro il componente, subito dopo la dichiarazione di `platinoAc`/`diamanteAc`, aggiungi:

```typescript
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  async function handleAvatarUpload(file: File) {
    setAvatarUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) {
      setProfile((p) => (p ? { ...p, avatar_url: data.avatar_url } : p));
      showToast("Foto aggiornata");
    } else {
      showToast(data.error || "Errore upload foto");
    }
    setAvatarUploading(false);
  }

  async function handleAvatarRemove() {
    setAvatarUploading(true);
    await fetch("/api/profile/avatar", { method: "DELETE" });
    setProfile((p) => (p ? { ...p, avatar_url: null } : p));
    setAvatarUploading(false);
  }
```

- [ ] **Step 2: Aggiungi la sezione JSX**

Subito dopo `<h1 className="text-xl font-bold text-text-primary">Impostazioni</h1>` e prima del commento `{/* Dati personali */}`, inserisci:

```tsx
      {/* Foto profilo */}
      <div className={cardClass}>
        <h2 className="font-semibold text-text-primary">Foto profilo</h2>
        <div className="flex items-center gap-4">
          <Avatar profile={profile} size="lg" />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={avatarUploading}
              onClick={() => avatarFileRef.current?.click()}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-border hover:bg-bg-section transition-colors disabled:opacity-50"
            >
              <Upload size={14} strokeWidth={1.75} />
              Carica nuova foto
            </button>
            {profile.avatar_url && (
              <button
                type="button"
                disabled={avatarUploading}
                onClick={handleAvatarRemove}
                className="text-sm text-text-secondary hover:text-text-primary px-4 py-2 rounded-xl border border-border transition-colors disabled:opacity-50"
              >
                Rimuovi
              </button>
            )}
          </div>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])}
          />
        </div>
      </div>

```

- [ ] **Step 3: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/impostazioni/page.tsx"
git commit -m "feat(impostazioni): sezione foto profilo"
```

---

## Task 11: Sezione Chiave AI + Account + link sidebar

**Files:**
- Modify: `src/app/(dashboard)/impostazioni/page.tsx`
- Modify: `src/components/sidebar.tsx:192`

**Interfaces:**
- Consumes: `GET/PATCH /api/profile` (già usato), campo `hasAnthropicKey`/`aiGenerationsRemaining` dalla risposta `GET /api/profile` (Task 3).

- [ ] **Step 1: Aggiungi import e stato per la chiave AI**

Aggiungi import:

```typescript
import { useRouter } from "next/navigation";
```

Dentro il componente, subito dopo `const [avatarUploading, setAvatarUploading] = useState(false);`, aggiungi:

```typescript
  const router = useRouter();
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [aiGenerationsRemaining, setAiGenerationsRemaining] = useState<number | null>(5);
  const [anthropicKeyInput, setAnthropicKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
```

Nel `useEffect` esistente che fa `fetch("/api/profile")`, aggiungi dopo `setLoading(false);`:

```typescript
        setHasAnthropicKey(d.hasAnthropicKey);
        setAiGenerationsRemaining(d.aiGenerationsRemaining);
```

Aggiungi le funzioni di salvataggio/rimozione chiave e logout:

```typescript
  async function handleSalvaChiave() {
    if (!anthropicKeyInput.trim()) return;
    setSavingKey(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anthropic_api_key: anthropicKeyInput.trim() }),
    });
    setSavingKey(false);
    if (res.ok) {
      setHasAnthropicKey(true);
      setAiGenerationsRemaining(null);
      setAnthropicKeyInput("");
      showToast("Chiave AI salvata");
    } else {
      showToast("Errore salvataggio chiave");
    }
  }

  async function handleRimuoviChiave() {
    setSavingKey(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anthropic_api_key: null }),
    });
    setSavingKey(false);
    if (res.ok) {
      setHasAnthropicKey(false);
      showToast("Chiave AI rimossa");
    }
  }

  async function handleLogout() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
```

- [ ] **Step 2: Aggiungi le sezioni JSX**

Subito dopo la chiusura della card "Notifiche email" (`</div>` che chiude quella sezione) e prima del bottone "Salva modifiche", inserisci:

```tsx

      {/* Chiave AI personale */}
      <div className={cardClass}>
        <h2 className="font-semibold text-text-primary">Chiave AI personale</h2>
        <p className="text-sm text-text-secondary">
          {hasAnthropicKey
            ? "Generazioni illimitate — chiave personale attiva."
            : `Hai usato ${5 - (aiGenerationsRemaining ?? 0)}/5 generazioni gratuite.`}
        </p>
        {hasAnthropicKey ? (
          <button
            type="button"
            disabled={savingKey}
            onClick={handleRimuoviChiave}
            className="text-sm text-text-secondary hover:text-text-primary px-4 py-2 rounded-xl border border-border transition-colors disabled:opacity-50"
          >
            Rimuovi chiave
          </button>
        ) : (
          <div className="space-y-2">
            <input
              type="password"
              className={inputClass}
              placeholder="sk-ant-api03-…"
              value={anthropicKeyInput}
              onChange={(e) => setAnthropicKeyInput(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={savingKey || !anthropicKeyInput.trim()}
                onClick={handleSalvaChiave}
                className="bg-accent hover:bg-accent-hover text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                Salva chiave
              </button>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener"
                className="text-xs text-accent hover:underline"
              >
                Crea una chiave su console.anthropic.com
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Account */}
      <div className={cardClass}>
        <h2 className="font-semibold text-text-primary">Account</h2>
        <div>
          <label className={labelClass}>Email</label>
          <input className={`${inputClass} opacity-60`} value={profile.email} disabled />
          <p className="text-xs text-text-secondary mt-1">Per cambiare contatta admin.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/auth/update-password")}
            className="text-sm text-text-secondary hover:text-text-primary px-4 py-2 rounded-xl border border-border transition-colors"
          >
            Cambia password
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-[#991b1b] hover:bg-[#fee2e2] px-4 py-2 rounded-xl border border-border transition-colors"
          >
            Esci
          </button>
        </div>
      </div>

```

- [ ] **Step 3: Aggiorna il link sidebar**

In `src/components/sidebar.tsx`, sostituisci:

```typescript
            onClick={() => router.push("/impostazioni/email-template")}
```

con:

```typescript
            onClick={() => router.push("/impostazioni")}
```

- [ ] **Step 4: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 5: Verifica manuale end-to-end nel browser**

```bash
npm run dev
```

Loggato come `alessandro@iseven.it`:
1. Click "Impostazioni" in sidebar → deve aprire `/impostazioni` (non più `/impostazioni/email-template`).
2. Verifica le 6 sezioni si caricano coi dati reali del profilo.
3. Carica una foto profilo, verifica che appaia subito.
4. Modifica un campo dati personali, clicca "Salva modifiche", ricarica la pagina, verifica persistenza.
5. Inserisci una chiave AI di test, verifica che la sezione mostri "Generazioni illimitate" e che `GET /api/profile` (controllabile dal Network tab del browser) non restituisca mai la chiave in chiaro.
6. Rimuovi la chiave, verifica che torni la vista "generazioni gratuite usate".
7. Vai su un evento nuovo/modifica, verifica che il pulsante "Genera con AI" sia coerente con lo stato appena impostato (visibile se chiave presente o generazioni rimaste, nascosto altrimenti).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/impostazioni/page.tsx" src/components/sidebar.tsx
git commit -m "feat(impostazioni): sezione chiave AI, account, aggiorna link sidebar"
```

---

## Self-Review

**Spec coverage:**
- Migration + storage (spec sezione "Migration 012" + "Storage") → Task 1. ✓
- Endpoint profilo/avatar/platino-search esteso (spec sezione "Endpoint") → Task 3, 4, 5. ✓
- Logica limite + chiave personale (spec sezione "Logica limite generazioni AI") → Task 2, 7, 8. ✓
- UI 6 sezioni + link sidebar (spec sezione "UI — pagina /impostazioni") → Task 9, 10, 11. ✓
- Componente `<Avatar>` (spec) → Task 6. ✓
- Fuori scope (cifratura chiave, reset mensile, messaggio sostitutivo nel form, pagamenti, rimozione email-template) → nessun task li introduce. ✓

**Placeholder scan:** rimossa la riga placeholder rimasta per errore nel Task 7 Step 1 (`const admin = createClient ? null : null;`) — sostituita dalla spiegazione testuale seguita dal blocco di codice completo reale. Nessun altro TBD/TODO nel piano.

**Type consistency:** `RiferimentoProfilo` (Task 9) coincide con la forma restituita da `platino-search` (Task 5: `id, codice_amway, nome, qualifica`). `Profile` interface (Task 9) coincide con `PROFILE_FIELDS` selezionati in `GET /api/profile` (Task 3). `getAiUsage`/`getAiGenerationsRemaining` (Task 2) usati con la stessa firma in Task 3, 7, 8. `hasAnthropicKey`/`aiGenerationsRemaining` dalla risposta `GET /api/profile` usati in Task 11 coincidono con i campi prodotti in Task 3.
